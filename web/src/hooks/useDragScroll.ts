import { useEffect, useRef, useState, type RefObject } from 'react';

export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  const [isDragging, setIsDragging] = useState(false);
  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const startYRef = useRef(0);
  const scrollTopRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchScrollLeftRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 1) return; // middle mouse only
      e.preventDefault();
      e.stopPropagation();
      isDownRef.current = true;
      setIsDragging(true);
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      scrollLeftRef.current = el.scrollLeft;
      scrollTopRef.current = el.scrollTop;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDownRef.current) return;
      e.preventDefault();
      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;
      el.scrollLeft = scrollLeftRef.current - dx;
      el.scrollTop = scrollTopRef.current - dy;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDownRef.current) return;
      e.preventDefault();
      isDownRef.current = false;
      setIsDragging(false);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartXRef.current = e.touches[0].clientX;
      touchScrollLeftRef.current = el.scrollLeft;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStartXRef.current;
      el.scrollLeft = touchScrollLeftRef.current - dx;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('auxclick', onAuxClick);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('auxclick', onAuxClick);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [ref]);

  return isDragging;
}
