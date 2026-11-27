import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { logError } from '../utils/errors';

import { tr } from '../i18n';
interface State {
  error: Error | null;
}

/**
 * Last-resort guard against render crashes. Uses plain styles because the
 * theme provider itself could be the failing component.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError('ErrorBoundary', { error, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{tr('Something went wrong')}</Text>
        <Text style={styles.message}>{tr('The screen could not be displayed. Your saved information is safe on this device.')}</Text>
        <Pressable
          style={styles.button}
          onPress={() => this.setState({ error: null })}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{tr('Try again')}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F5F6FA' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  message: { fontSize: 15, color: '#4B5563', textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#0B4A3A', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
});
