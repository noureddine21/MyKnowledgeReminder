/**
 * Typed access to the app's own Android module (android/.../MkrNativeModule.kt).
 * Every call fails with a clear AppError when the module is missing (tests, iOS).
 */
import { NativeModules, Platform } from 'react-native';
import { AppError } from '../utils/errors';

interface MkrNativeSpec {
  saveTextFile(fileName: string, mimeType: string, content: string): Promise<string | null>;
  openTextFile(): Promise<string | null>;
  isSpeechAvailable(): Promise<boolean>;
  startSpeech(language: string | null, prompt: string | null): Promise<string | null>;
  recognizeText(uri: string): Promise<string>;
  updateWidget(snapshotJson: string): Promise<number>;
  setShowWhenLocked(enabled: boolean): Promise<boolean>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<boolean>;
}

function module(): MkrNativeSpec {
  const native = NativeModules.MkrNative as MkrNativeSpec | undefined;
  if (Platform.OS !== 'android' || !native) {
    throw new AppError('NATIVE', 'This feature is only available in the Android app.');
  }
  return native;
}

export function isNativeAvailable(): boolean {
  return Platform.OS === 'android' && !!NativeModules.MkrNative;
}

/** Opens the system "Save as" dialog. Resolves with the file URI, or null if cancelled. */
export function saveTextFile(fileName: string, content: string, mimeType = 'application/json') {
  return module().saveTextFile(fileName, mimeType, content);
}

/** Opens the system file picker. Resolves with the file text, or null if cancelled. */
export function openTextFile() {
  return module().openTextFile();
}

export async function isSpeechAvailable(): Promise<boolean> {
  try {
    return await module().isSpeechAvailable();
  } catch {
    return false;
  }
}

/** Shows the Android voice input dialog. Resolves with the recognized text, or null if cancelled. */
export function startSpeech(language: string | null = null, prompt: string | null = null) {
  return module().startSpeech(language, prompt);
}

/** Reads the text of an image (content:// URI) on the device. */
export function recognizeText(uri: string) {
  return module().recognizeText(uri);
}

export function updateWidget(snapshot: object) {
  return module().updateWidget(JSON.stringify(snapshot));
}

/** Shows the current screen over the lock screen (Alarm screen only). Never throws. */
export async function setShowWhenLocked(enabled: boolean): Promise<void> {
  try {
    await module().setShowWhenLocked(enabled);
  } catch {
    // Not available (tests, iOS).
  }
}

export async function canUseFullScreenIntent(): Promise<boolean> {
  try {
    return await module().canUseFullScreenIntent();
  } catch {
    return true;
  }
}

export function openFullScreenIntentSettings() {
  return module().openFullScreenIntentSettings();
}
