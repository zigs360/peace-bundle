const fs = require('fs');
const { parse } = require('csv-parse');
const ProcessBulkDataSend = require('../jobs/processBulkDataSend');
const { validationResult } = require('express-validator');

class BulkDataController {
    
    // GET /api/user/data/bulk
    // In an API context, this might just return config or permissions, 
    // but usually the frontend handles the view. 
    // We'll keep it simple or omit if not needed, but for completeness:
    async index(req, res) {
        // Authorize 'bulk-send-data' - Middleware should handle this usually
        // But we can check permissions here
        // if (!req.user.can('bulk-send-data')) ...
        res.json({ message: 'Ready for upload' });
    }

    // POST /api/user/data/bulk/upload
    async upload(req, res) {
        // Validation for file existence
        if (!req.file) {
            return res.status(400).json({ message: 'File is required' });
        }

        try {
            const filePath = req.file.path;
            const fileContent = fs.readFileSync(filePath);
            
            // Parse CSV
            const records = [];
            const parser = parse(fileContent, {
                delimiter: ',',
                skip_empty_lines: true,
                trim: true
            });

            parser.on('readable', function(){
                let record;
                while ((record = parser.read()) !== null) {
                    records.push(record);
                }
            });

            parser.on('error', function(err){
                console.error(err.message);
                res.status(400).json({ message: 'Failed to parse CSV' });
            });

            parser.on('end', async function(){
                // Skip header row
                if (records.length > 0) {
                    // Simple heuristic: check if first row looks like header (non-numeric phone)
                    const firstRow = records[0];
                    if (isNaN(parseInt(firstRow[0]))) {
                        records.shift();
                    }
                }

                const purchases = [];
                for (const row of records) {
                    if (!row[0] || !row[1]) continue;
                    
                    purchases.push({
                        recipient_phone: row[0],
                        plan_id: row[1],
                        sim_id: row[2] || null
                    });
                }

                if (purchases.length === 0) {
                     // Clean up file
                     fs.unlinkSync(filePath);
                     return res.status(400).json({ message: 'No valid data found in CSV file' });
                }

                // Dispatch job
                ProcessBulkDataSend.dispatch(req.user, purchases);

                // Clean up file
                fs.unlinkSync(filePath);

                res.json({
                    message: `Bulk send initiated for ${purchases.length} transactions. You'll be notified when complete.`
                });
            });
            
            // Trigger parsing
            parser.write(fileContent);
            parser.end();

        } catch (error) {
            console.error('BulkDataController.upload error:', error);
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            res.status(500).json({ message: 'Failed to process CSV: ' + error.message });
        }
    }
}

module.exports = new BulkDataController();
