import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import type { FlowBlock, FlowStep } from '../../constants/playbook';
import { ActionList } from './ActionList';
import { ChipRow } from './ChipRow';
import { SayLine } from './SayLine';

type Props = { step: FlowStep; number: number; isLast: boolean };

function Block({ block, headingStyle }: { block: FlowBlock; headingStyle: object }) {
  switch (block.kind) {
    case 'actions':
      return <ActionList items={block.items} />;
    case 'say':
      return <SayLine text={block.text} />;
    case 'heading':
      return <Text style={headingStyle} accessibilityRole="header">{block.text}</Text>;
  }
}

/** One numbered step on the playbook rail, with optional branch chips. */
export function StepCard({ step, number, isLast }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [branchIndex, setBranchIndex] = useState(0);

  const branches = step.branches ?? [];
  const branch = branches[branchIndex];
  const blocks = branch ? branch.blocks : step.blocks ?? [];

  return (
    <View style={styles.row} testID={`playbook-step-${step.id}`}>
      <View style={styles.rail}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
        {!isLast && <View style={styles.line} />}
      </View>
      <View style={styles.card}>
        <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
        {branches.length > 0 && (
          <ChipRow
            options={branches.map((b, i) => ({ key: String(i), label: b.label }))}
            value={String(branchIndex)}
            onChange={(k) => setBranchIndex(Number(k))}
            testIDPrefix={`playbook-branch-${step.id}`}
          />
        )}
        {blocks.map((block, i) => (
          <Block key={i} block={block} headingStyle={styles.heading} />
        ))}
        {branch?.shortcut === 'free-taste' && (
          <TouchableOpacity
            testID="playbook-shortcut-free-taste"
            style={styles.shortcut}
            onPress={() => router.push('/modals/free-taste')}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="nutrition-outline" size={18} color="#fff" />
            <Text style={styles.shortcutText}>Record a free taste</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 12 },
    rail: { width: 30, alignItems: 'center' },
    badge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.pink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { color: '#fff', fontSize: F.sm, fontWeight: '800' },
    line: { flex: 1, width: 2, marginVertical: 6, backgroundColor: c.border, borderRadius: 1 },
    card: {
      flex: 1,
      minWidth: 0,
      gap: 12,
      padding: 16,
      marginBottom: 14,
      backgroundColor: c.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: c.borderDark,
    },
    title: { color: c.textPrimary, fontSize: F.lg, fontWeight: '800' },
    heading: { color: c.textMuted, fontSize: F.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: -4 },
    shortcut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: R.md,
      backgroundColor: c.pink,
    },
    shortcutText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
  });
