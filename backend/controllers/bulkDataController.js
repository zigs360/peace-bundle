const fs = require('fs');
const { parse } = require('csv-parse');
const ProcessBulkDataSend = require('../jobs/processBulkDataSend');
const logger = require('../utils/logger');

class BulkDataController {
    
    // GET /api/user/data/bulk
    async index(req, res) {
        res.json({ success: true, message: 'Ready for upload' });
    }

    // POST /api/user/data/bulk/upload
    async upload(req, res) {
        // Validation for file existence
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File is required' });
        }

        const filePath = req.file.path;

        try {
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
                logger.error('CSV Parsing Error:', { error: err.message, userId: req.user.id });
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                res.status(400).json({ success: false, message: 'Failed to parse CSV' });
            });

            parser.on('end', async function(){
                try {
                    // Skip header row
                    if (records.length > 0) {
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
                         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                         return res.status(400).json({ success: false, message: 'No valid data found in CSV file' });
                    }

                    // Dispatch job
                    ProcessBulkDataSend.dispatch(req.user, purchases);

                    // Clean up file
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

                    res.json({
                        success: true,
                        message: `Bulk send initiated for ${purchases.length} transactions. You'll be notified when complete.`
                    });
                } catch (innerError) {
                    logger.error('BulkData Processing Error:', { error: innerError.message, userId: req.user.id });
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    res.status(500).json({ success: false, message: 'Internal server error during processing' });
                }
            });
            
            // Trigger parsing
            parser.write(fileContent);
            parser.end();

        } catch (error) {
            logger.error('BulkDataController.upload error:', { error: error.message, userId: req.user.id });
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            res.status(500).json({ success: false, message: 'Failed to process CSV: ' + error.message });
        }
    }
}

module.exports = new BulkDataController();
