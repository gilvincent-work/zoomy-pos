import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, useWindowDimensions,
} from 'react-native';
import { F, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  FLOW_STEPS, AUDIENCE_FILTERS, PLAYBOOK_AS_OF, notesForFilter, type PlaybookAudience,
} from '../../constants/playbook';
import { StepCard } from '../../components/playbook/StepCard';
import { ProductNoteCard } from '../../components/playbook/ProductNoteCard';
import { ChipRow } from '../../components/playbook/ChipRow';

type Tab = 'flow' | 'products';

const WIDE_BREAKPOINT = 700;
const CONTENT_MAX_WIDTH = 920;

export default function PlaybookScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const [tab, setTab] = useState<Tab>('flow');
  const [filter, setFilter] = useState<'all' | PlaybookAudience>('all');

  const notes = notesForFilter(filter);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tabsRow}>
        {(['flow', 'products'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            testID={`playbook-tab-${t}`}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'flow' ? 'Flow' : 'Products'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          {tab === 'flow' ? (
            FLOW_STEPS.map((step, i) => (
              <StepCard key={step.id} step={step} number={i + 1} isLast={i === FLOW_STEPS.length - 1} />
            ))
          ) : (
            <>
              <ChipRow
                options={AUDIENCE_FILTERS}
                value={filter}
                onChange={setFilter}
                testIDPrefix="playbook-filter"
              />
              <View style={styles.notes}>
                {notes.map((n) => (
                  <View key={n.id} style={wide ? styles.noteWide : styles.noteFull}>
                    <ProductNoteCard note={n} />
                  </View>
                ))}
              </View>
              <Text style={styles.asOf}>Notes checked {PLAYBOOK_AS_OF}. Always trust the batch label.</Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderDark,
      backgroundColor: c.surface,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: c.pink, borderColor: c.pink },
    tabLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700' },
    tabLabelActive: { color: '#fff' },
    content: { padding: 16, paddingBottom: 32 },
    inner: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', gap: 4 },
    notes: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginTop: 12 },
    noteFull: { width: '100%', padding: 6 },
    noteWide: { width: '50%', padding: 6 },
    asOf: { color: c.textMuted, fontSize: F.xs, textAlign: 'center', marginTop: 12 },
  });
