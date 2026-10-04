import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTour } from '../../context/TourContext';

type Props = {
  /** The id a tour step names in its `target`. */
  id: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Marks an element the tour can spotlight. It renders a plain View (pass layout
 * through `style`) and registers a measure function with the tour provider, which
 * reads the element's window position only when a step needs it.
 */
export function TourTarget({ id, style, children }: Props) {
  const { registerTarget } = useTour();
  const ref = useRef<View>(null);

  useEffect(
    () =>
      registerTarget(
        id,
        () =>
          new Promise((resolve) => {
            const node = ref.current;
            if (!node) return resolve(null);
            node.measureInWindow((x, y, width, height) =>
              resolve(width > 0 && height > 0 ? { x, y, width, height } : null)
            );
          })
      ),
    [id, registerTarget]
  );

  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}
