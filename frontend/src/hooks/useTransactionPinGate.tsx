import { useState } from 'react';
import TransactionPinPrompt from '../components/ui/TransactionPinPrompt';
import { getStoredTransactionPinSession, type TransactionPinSession } from '../utils/transactionPin';

interface PinPromptConfig {
  scope?: string;
  amountLabel?: string;
  actionLabel?: string;
}

type PendingAction = (() => Promise<void>) | null;

export function useTransactionPinGate(defaultScope = 'financial') {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [promptConfig, setPromptConfig] = useState<PinPromptConfig>({ scope: defaultScope });

  const ensureTransactionPin = async (action: () => Promise<void>, config: PinPromptConfig = {}) => {
    const scope = config.scope || defaultScope;
    const existingSession = getStoredTransactionPinSession(scope);
    if (existingSession) {
      await action();
      return;
    }

    setPromptConfig({
      scope,
      amountLabel: config.amountLabel,
      actionLabel: config.actionLabel,
    });
    setPendingAction(() => action);
    setOpen(true);
  };

  const handleVerified = async (_session: TransactionPinSession) => {
    const action = pendingAction;
    setPendingAction(null);
    setOpen(false);
    if (action) {
      await action();
    }
  };

  const prompt = (
    <TransactionPinPrompt
      open={open}
      onClose={() => {
        setOpen(false);
        setPendingAction(null);
      }}
      onVerified={handleVerified}
      scope={promptConfig.scope || defaultScope}
      amountLabel={promptConfig.amountLabel}
      actionLabel={promptConfig.actionLabel}
    />
  );

  return {
    ensureTransactionPin,
    prompt,
  };
}
