import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';

type Props = {
  id: number;
  name: string;
  emoji: string;
  badgeCount: number;
  onPress: (id: number) => void;
  onLongPress: (id: number) => void;
  onMinus?: (id: number) => void;
};

export function ProductTile({ id, name, emoji, badgeCount, onPress, onLongPress, onMinus }: Props) {
  return (
    <TouchableOpacity
      testID="tile"
      style={styles.tile}
      onPress={() => onPress(id)}
      onLongPress={() => onLongPress(id)}
      activeOpacity={0.7}
    >
      {badgeCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText} testID="badge">{badgeCount}</Text>
        </View>
      )}
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {badgeCount > 0 && onMinus && (
        <TouchableOpacity
          testID="minus-btn"
          style={styles.minusBtn}
          onPress={(e) => {
            e.stopPropagation();
            onMinus(id);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={styles.minusText}>−</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#e94560',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  emoji: { fontSize: 28 },
  name: { color: '#eee', fontSize: 11, marginTop: 4, textAlign: 'center' },
  minusBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#e94560',
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { color: '#fff', fontSize: 16, fontWeight: 'bold', lineHeight: 18 },
});
