import { useCallback, useRef } from 'react';
import {
  findNodeHandle,
  Keyboard,
  TextInput,
  UIManager,
  type ScrollView,
} from 'react-native';

/**
 * Lightweight form focus + scroll helpers.
 * Only scrolls when the focused field would sit under the keyboard region.
 */
export function useFormFlow() {
  const scrollRef = useRef<ScrollView>(null);
  const fieldRefs = useRef<Record<string, TextInput | null>>({});

  const register = useCallback((key: string) => {
    return (ref: TextInput | null) => {
      fieldRefs.current[key] = ref;
    };
  }, []);

  const focus = useCallback((key: string) => {
    const input = fieldRefs.current[key];
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
    });
  }, []);

  const scrollFieldIntoView = useCallback((key: string, extraOffset = 24) => {
    const scroll = scrollRef.current;
    const input = fieldRefs.current[key];
    if (!scroll || !input) return;

    const scrollNode = findNodeHandle(scroll);
    const inputNode = findNodeHandle(input);
    if (!scrollNode || !inputNode) return;

    UIManager.measureLayout(
      inputNode,
      scrollNode,
      () => {
        // ignore measure failures
      },
      (_x, y, _width, height) => {
        scroll.scrollTo({
          y: Math.max(0, y - extraOffset),
          animated: true,
        });
        // Keep a bit of breathing room below the field for helper/CTA.
        void height;
      }
    );
  }, []);

  const focusAndReveal = useCallback(
    (key: string, extraOffset = 24) => {
      focus(key);
      // Wait a beat for keyboard + layout, then scroll if needed.
      setTimeout(() => {
        scrollFieldIntoView(key, extraOffset);
      }, 80);
    },
    [focus, scrollFieldIntoView]
  );

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  return {
    scrollRef,
    register,
    focus,
    focusAndReveal,
    scrollFieldIntoView,
    dismissKeyboard,
  };
}
