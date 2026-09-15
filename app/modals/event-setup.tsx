import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import {
  getActiveEvent,
  setLocalEventCash,
  upsertLocalEvent,
  localDateKey,
  type PosEvent,
} from '../../db/events';
import { newEventId } from '../../utils/events-sync';
import { drainOutbox } from '../../utils/outbox';

/**
 * Event day setup sheet (opened from the header event chip). Two modes:
 *  - An event is detected for today (the common case): count the drawer and
 *    save the opening cash float onto that event.
 *  - No event today, or the cashier taps "Start a new event": create an
 *    unplanned on-site event (name/venue/city/organizer + float).
 * Every write is local-first and queues a Coop push (upsert_pos_event) via the
 * outbox, so this works fully offline. Selling is never gated on any of it.
 */
export default function EventSetupModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();

  const [active, setActive] = useState<PosEvent | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  // Float form (existing event)
  const [cash, setCash] = useState('');
  const [cashNote, setCashNote] = useState('');

  // New-event form
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [newCash, setNewCash] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getActiveEvent().then((ev) => {
        if (cancelled) return;
        setActive(ev);
        setCreating(ev == null); // no event today -> go straight to create
        setCash(ev?.opening_cash != null ? String(ev.opening_cash) : '');
        setCashNote(ev?.cash_note ?? '');
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [])
  );

  /** Parse a peso amount; empty -> null, invalid -> null. */
  function parseAmount(v: string): number | null {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return v.trim() === '' || Number.isNaN(n) ? null : n;
  }

  async function saveFloat() {
    if (!active) return;
    await setLocalEventCash(active.event_id, parseAmount(cash), cashNote.trim() || null);
    drainOutbox().catch(() => {});
    showToast({ variant: 'success', title: 'Opening cash saved', message: `${active.venue?.trim() || active.name}` });
    router.back();
  }

  async function createEvent() {
    if (name.trim() === '') {
      showToast({ variant: 'error', title: 'Name the event', message: 'An event needs a name.' });
      return;
    }
    // Block overlaps at creation (decided 2026-09-15): an on-site event covers
    // today, so refuse if today is already an event day. Re-check fresh in case
    // a pull arrived while the sheet was open. Coop enforces the same rule
    // authoritatively in upsert_pos_event; this is the friendly local guard.
    const covering = await getActiveEvent();
    if (covering) {
      showToast({
        variant: 'error',
        title: 'Today already has an event',
        message: `${covering.name} covers today. Set its opening cash instead.`,
      });
      return;
    }
    const now = new Date().toISOString();
    const today = localDateKey();
    await upsertLocalEvent({
      event_id: newEventId(),
      name: name.trim(),
      venue: venue.trim() || null,
      city: city.trim() || null,
      organizer: organizer.trim() || null,
      // On-site events default to a single day (today), so detection covers it now.
      starts_on: today,
      ends_on: today,
      opening_cash: parseAmount(newCash),
      cash_note: null,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
    drainOutbox().catch(() => {});
    showToast({ variant: 'success', title: 'Event created', message: name.trim() });
    router.back();
  }

  if (!loaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {!creating && active && (
          <>
            <Text style={styles.sectionLabel}>TODAY'S EVENT</Text>
            <View style={styles.eventCard}>
              <Text style={styles.eventName}>{active.name}</Text>
              <Text style={styles.eventMeta}>
                {[active.venue, active.city].filter(Boolean).join(' · ') || 'No location set'}
              </Text>
              {(active.starts_on || active.ends_on) && (
                <Text style={styles.eventDates}>
                  {active.starts_on === active.ends_on
                    ? active.starts_on
                    : `${active.starts_on ?? '…'} to ${active.ends_on ?? '…'}`}
                </Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>OPENING CASH FLOAT</Text>
            <Text style={styles.hint}>Count the drawer at open. Enter the starting cash.</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.peso}>₱</Text>
              <TextInput
                testID="event-opening-cash"
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={cash}
                onChangeText={setCash}
                keyboardType="numeric"
              />
            </View>

            <Text style={styles.sectionLabel}>CASH NOTE <Text style={styles.optional}>optional</Text></Text>
            <TextInput
              style={styles.textInput}
              placeholder="Mostly ₱20s and ₱50s…"
              placeholderTextColor={colors.textMuted}
              value={cashNote}
              onChangeText={setCashNote}
            />

            <TouchableOpacity style={styles.primaryBtn} onPress={saveFloat} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Save opening cash</Text>
            </TouchableOpacity>
          </>
        )}

        {creating && (
          <>
            <Text style={styles.sectionLabel}>NEW EVENT</Text>
            <Text style={styles.hint}>For an unplanned pop-up not scheduled on Coop. Covers today.</Text>

            <Text style={styles.fieldLabel}>Event name</Text>
            <TextInput
              testID="new-event-name"
              style={styles.textInput}
              placeholder="Pet Bazaar · Weekend 4"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.fieldLabel}>Venue / mall</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ayala Trinoma"
              placeholderTextColor={colors.textMuted}
              value={venue}
              onChangeText={setVenue}
            />
            <Text style={styles.fieldLabel}>City</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Quezon City"
              placeholderTextColor={colors.textMuted}
              value={city}
              onChangeText={setCity}
            />
            <Text style={styles.fieldLabel}>Organizer <Text style={styles.optional}>optional</Text></Text>
            <TextInput
              style={styles.textInput}
              placeholder="Pet Express…"
              placeholderTextColor={colors.textMuted}
              value={organizer}
              onChangeText={setOrganizer}
            />
            <Text style={styles.fieldLabel}>Opening cash float</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.peso}>₱</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={newCash}
                onChangeText={setNewCash}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={createEvent} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Create &amp; select</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 8, paddingBottom: 40 },
  sectionLabel: {
    color: c.textMuted, fontSize: F.xs, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 14,
  },
  optional: { color: c.textMuted, fontSize: F.xs, fontWeight: '400', letterSpacing: 0, textTransform: 'none' },
  hint: { color: c.textMuted, fontSize: F.xs, marginTop: -2, marginBottom: 4 },
  eventCard: {
    backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border,
    padding: 14, gap: 3,
  },
  eventName: { color: c.textPrimary, fontSize: F.md, fontWeight: '800' },
  eventMeta: { color: c.textSecondary, fontSize: F.sm },
  eventDates: { color: c.textMuted, fontSize: F.xs, fontWeight: '600' },
  fieldLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700', marginTop: 8 },
  textInput: {
    backgroundColor: c.surface, color: c.textPrimary, borderRadius: R.sm, borderWidth: 1,
    borderColor: c.border, paddingVertical: 11, paddingHorizontal: 14, fontSize: F.md,
  },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface,
    borderRadius: R.sm, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14,
  },
  peso: { color: c.textSecondary, fontSize: F.xl, fontWeight: '800' },
  amountInput: { flex: 1, color: c.textPrimary, fontSize: F.xl, fontWeight: '800', paddingVertical: 12 },
  primaryBtn: {
    backgroundColor: c.pink, borderRadius: R.md, paddingVertical: 15, alignItems: 'center', marginTop: 18,
  },
  primaryBtnText: { color: '#fff', fontSize: F.md, fontWeight: '800' },
});
