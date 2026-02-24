import { Check } from 'lucide-react';

interface SelectProviderProps {
  value: string;
  onChange: (value: string) => void;
}

const providers = [
  { 
    id: 'mtn', 
    name: 'MTN', 
    color: '#FFCC00', 
    textColor: '#000000', 
    logo: '/logos/mtn.jpg' 
  },
  { 
    id: 'airtel', 
    name: 'Airtel', 
    color: '#FF0000', 
    textColor: '#FFFFFF', 
    logo: '/logos/airtel.svg' 
  },
  { 
    id: 'glo', 
    name: 'Glo', 
    color: '#00A859', 
    textColor: '#FFFFFF', 
    logo: '/logos/glo.png' 
  },
  { 
    id: '9mobile', 
    name: '9mobile', 
    color: '#006C35', 
    textColor: '#FFFFFF', 
    logo: '/logos/9mobile.svg' 
  },
];

export default function SelectProvider({ value, onChange }: SelectProviderProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">Select Network</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {providers.map((provider) => {
            // value can be uppercase or lowercase, we compare against lowercase ID
            const isSelected = value?.toLowerCase() === provider.id;
            return (
                <button
                    key={provider.id}
                    type="button"
                    onClick={() => onChange(provider.id)}
                    className={`relative flex flex-col items-center justify-center p-4 border-2 rounded-xl transition-all duration-200 group overflow-hidden ${
                    isSelected
                        ? 'border-transparent shadow-md transform scale-[1.02]'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    style={{
                        backgroundColor: isSelected ? provider.color : undefined,
                        color: isSelected ? provider.textColor : undefined,
                    }}
                >
                    {/* Checkmark indicator */}
                    {isSelected && (
                        <div className="absolute top-2 right-2 p-0.5 rounded-full bg-white/20 backdrop-blur-sm">
                            <Check className="w-4 h-4" />
                        </div>
                    )}

                    <div className="w-12 h-12 mb-3 rounded-full bg-white p-2 shadow-sm flex items-center justify-center overflow-hidden">
                        <img 
                            src={provider.logo} 
                            alt={`${provider.name} logo`} 
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerText = provider.name[0];
                            }}
                        />
                    </div>
                    <span className="font-bold text-sm tracking-wide">{provider.name}</span>
                </button>
            );
        })}
      </div>
    </div>
  );
}
