interface Plan {
  id: string;
  name: string;
  price: number;
  size: number;
  validity: string;
}

interface PlanSelectorProps {
  plans: Plan[];
  selectedPlanId: string;
  onChange: (planId: string) => void;
}

export default function PlanSelector({ plans, selectedPlanId, onChange }: PlanSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Select Plan</label>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onChange(plan.id)}
            className={`w-full flex items-center justify-between px-4 py-3 border rounded-lg text-left transition-colors ${
              selectedPlanId === plan.id
                ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div>
              <p className="font-medium text-gray-900">{plan.name}</p>
              <p className="text-xs text-gray-500">{plan.validity}</p>
            </div>
            <p className="font-bold text-gray-900">₦{plan.price}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
