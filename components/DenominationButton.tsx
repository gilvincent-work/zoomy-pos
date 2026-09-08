import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { F, R, type Palette } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

type Props = { amount: number; onPress: (amount: number) => void };

export function DenominationButton({ amount, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.btn} onPress={() => onPress(amount)} activeOpacity={0.65}>
      <Text style={styles.text}>₱{amount}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  btn: {
    backgroundColor: c.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: c.textPrimary, fontSize: F.md, fontWeight: '700' },
});
