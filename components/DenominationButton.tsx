import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

type Props = { amount: number; onPress: (amount: number) => void };

export function DenominationButton({ amount, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.btn} onPress={() => onPress(amount)} activeOpacity={0.7}>
      <Text style={styles.text}>₱{amount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#0f3460',
    borderRadius: 6,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
