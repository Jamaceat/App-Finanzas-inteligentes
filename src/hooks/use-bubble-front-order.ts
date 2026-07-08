import { useCallback, useRef, useState } from 'react';

const BASE_Z_INDEX = 1;

// Bring-to-front stacking for wandering/draggable bubbles: whichever bubble was
// last interacted with keeps the highest zIndex, even after the gesture ends,
// so it stays in front of whatever it was dropped on top of. Shared between
// asignar-gastos (FloatingExpensePoint) and the pocket widget (FloatingBubble).
export function useBubbleFrontOrder() {
  const [order, setOrder] = useState<Record<string, number>>({});
  const counterRef = useRef(BASE_Z_INDEX);

  const bringToFront = useCallback((key: string) => {
    counterRef.current += 1;
    const next = counterRef.current;
    setOrder((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
  }, []);

  const getZIndex = useCallback((key: string) => order[key] ?? BASE_Z_INDEX, [order]);

  return { bringToFront, getZIndex };
}
