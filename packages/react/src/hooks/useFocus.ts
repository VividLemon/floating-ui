import {isElement, isHTMLElement} from '@floating-ui/utils/dom';
import {
  activeElement,
  contains,
  getDocument,
  isEventTargetWithin,
} from '@floating-ui/utils/react';
import * as React from 'react';

import type {ElementProps, FloatingContext, ReferenceType} from '../types';
import {createAttribute} from '../utils/createAttribute';
import type {DismissPayload} from './useDismiss';

export interface UseFocusProps {
  enabled?: boolean;
  keyboardOnly?: boolean;
}

/**
 * Opens the floating element while the reference element has focus, like CSS
 * `:focus`.
 * @see https://floating-ui.com/docs/useFocus
 */
export function useFocus<RT extends ReferenceType = ReferenceType>(
  context: FloatingContext<RT>,
  props: UseFocusProps = {}
): ElementProps {
  const {
    open,
    onOpenChange,
    dataRef,
    events,
    refs,
    elements: {floating, domReference},
  } = context;
  const {enabled = true, keyboardOnly = true} = props;

  const pointerTypeRef = React.useRef('');
  const blockFocusRef = React.useRef(false);
  const timeoutRef = React.useRef<any>();

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const doc = getDocument(floating);
    const win = doc.defaultView || window;

    // If the reference was focused and the user left the tab/window, and the
    // floating element was not open, the focus should be blocked when they
    // return to the tab/window.
    function onBlur() {
      if (
        !open &&
        isHTMLElement(domReference) &&
        domReference === activeElement(getDocument(domReference))
      ) {
        blockFocusRef.current = true;
      }
    }

    win.addEventListener('blur', onBlur);
    return () => {
      win.removeEventListener('blur', onBlur);
    };
  }, [floating, domReference, open, enabled]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    function onDismiss(payload: DismissPayload) {
      if (payload.type === 'referencePress' || payload.type === 'escapeKey') {
        blockFocusRef.current = true;
      }
    }

    events.on('dismiss', onDismiss);
    return () => {
      events.off('dismiss', onDismiss);
    };
  }, [events, enabled]);

  React.useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return React.useMemo(() => {
    if (!enabled) {
      return {};
    }

    return {
      reference: {
        onPointerDown({pointerType}) {
          pointerTypeRef.current = pointerType;
          blockFocusRef.current = !!(pointerType && keyboardOnly);
        },
        onMouseLeave() {
          blockFocusRef.current = false;
        },
        onFocus(event) {
          if (blockFocusRef.current) {
            return;
          }

          // Dismiss with click should ignore the subsequent `focus` trigger,
          // but only if the click originated inside the reference element.
          if (
            event.type === 'focus' &&
            dataRef.current.openEvent?.type === 'mousedown' &&
            isEventTargetWithin(dataRef.current.openEvent, domReference)
          ) {
            return;
          }

          onOpenChange(true, event.nativeEvent);
        },
        onBlur(event) {
          blockFocusRef.current = false;
          const relatedTarget = event.relatedTarget;

          if (!relatedTarget) return;

          // Hit the non-modal focus management portal guard. Focus will be
          // moved into the floating element immediately after.
          const movedToFocusGuard =
            isElement(relatedTarget) &&
            relatedTarget.hasAttribute(createAttribute('focus-guard')) &&
            relatedTarget.getAttribute('data-type') === 'outside';

          // Wait for the window blur listener to fire.
          timeoutRef.current = setTimeout(() => {
            // When focusing the reference element (e.g. regular click), then
            // clicking into the floating element, prevent it from hiding.
            // Note: it must be focusable, e.g. `tabindex="-1"`.
            if (
              contains(refs.floating.current, relatedTarget) ||
              contains(domReference, relatedTarget) ||
              movedToFocusGuard
            ) {
              return;
            }

            onOpenChange(false, event.nativeEvent);
          });
        },
      },
    };
  }, [enabled, keyboardOnly, domReference, refs, dataRef, onOpenChange]);
}
