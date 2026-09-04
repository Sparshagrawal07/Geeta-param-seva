import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps extends PropsWithChildren {
  fallbackMessage?: string;
  retryLabel?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('Unhandled UI error', error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-gp-bg px-6 dark:bg-gp-bg-dark">
          <AppText bold className="text-center text-xl text-gp-text dark:text-gp-text-dark">
            {this.props.fallbackMessage ?? 'Something went wrong.'}
          </AppText>
          <View className="mt-6 w-full">
            <AppButton
              label={this.props.retryLabel ?? 'Try again'}
              fullWidth
              onPress={this.handleRetry}
            />
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}
