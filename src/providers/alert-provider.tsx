import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

import { AppConfirmDialog } from '@/components/ui/app-confirm-dialog';
import { useLocale } from '@/providers/locale-provider';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface AlertOptions {
  title: string;
  message?: string;
  okLabel?: string;
  onClose?: () => void;
}

interface DialogState {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface AlertContextValue {
  confirm: (options: ConfirmOptions) => void;
  alert: (options: AlertOptions) => void;
  isOpen: boolean;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const dismiss = useCallback(() => {
    setDialog(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? t('confirm'),
      cancelLabel: options.cancelLabel ?? t('cancel'),
      destructive: options.destructive,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel,
    });
  }, [t]);

  const alert = useCallback(
    (options: AlertOptions) => {
      setDialog({
        title: options.title,
        message: options.message,
        confirmLabel: options.okLabel ?? t('ok'),
        onConfirm: () => {
          options.onClose?.();
        },
      });
    },
    [t]
  );

  useEffect(() => {
    if (!dialog) {
      return;
    }

    const onBackPress = () => {
      dialog.onCancel?.();
      dismiss();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [dialog, dismiss]);

  const value = useMemo(() => ({ confirm, alert, isOpen: !!dialog }), [alert, confirm, dialog]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AppConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel ?? t('ok')}
        cancelLabel={dialog?.cancelLabel}
        destructive={dialog?.destructive}
        onConfirm={() => {
          const onConfirm = dialog?.onConfirm;
          dismiss();
          onConfirm?.();
        }}
        onCancel={() => {
          dialog?.onCancel?.();
          dismiss();
        }}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
}
