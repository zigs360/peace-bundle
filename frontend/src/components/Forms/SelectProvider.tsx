interface SelectProviderProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SelectProvider({ value, onChange }: SelectProviderProps) {
  const providers = [
    { id: 'MTN', name: 'MTN' },
    { id: 'AIRTEL', name: 'Airtel' },
    { id: 'GLO', name: 'Glo' },
    { id: '9MOBILE', name: '9mobile' },
  ];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Select Network</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => onChange(provider.id)}
            className={`flex items-center justify-center px-4 py-3 border rounded-lg text-sm font-medium transition-colors ${
              value === provider.id
                ? 'border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500 ring-opacity-50'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {provider.name}
          </button>
        ))}
      </div>
    </div>
  );
}
