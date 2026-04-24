import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, F, R } from '../constants/theme';

type Props = { amount: number; onPress: (amount: number) => void };

export function DenominationButton({ amount, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.btn} onPress={() => onPress(amount)} activeOpacity={0.65}>
      <Text style={styles.text}>₱{amount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: C.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: C.textPrimary, fontSize: F.md, fontWeight: '700' },
});
