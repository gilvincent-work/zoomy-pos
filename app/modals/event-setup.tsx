import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { F, R, type Palette } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import {
  getActiveEvent,
  getLocalEvents,
  upsertLocalEvent,
  overlappingEvent,
  isValidDateKey,
  localDateKey,
  type PosEvent,
} from '../../db/events';
import { newEventId } from '../../utils/events-sync';
import { drainOutbox } from '../../utils/outbox';

/**
 * Event setup sheet (opened from the header event chip). One full form for both
 * modes: edit today's detected event (name, venue, dates, opening + closing cash)
 * or schedule a new one (any date range, not just today). Every write is
 * local-first and queues a Coop push (upsert_pos_event) via the outbox, so it works
 * fully offline; the date range is guarded against overlaps the way Coop enforces.
 * Selling is never gated on any of it.
 */
export default function EventSetupModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showToast } = useToast();

  const [active, setActive] = useState<PosEvent | null>(null);
  const [allEvents, setAllEvents] = useState<PosEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [closingCash, setClosingCash] = useState('');

  const fillFrom = useCallback((ev: PosEvent | null) => {
    const today = localDateKey();
    setName(ev?.name ?? '');
    setVenue(ev?.venue ?? '');
    setCity(ev?.city ?? '');
    setOrganizer(ev?.organizer ?? '');
    setStartsOn(ev?.starts_on ?? today);
    setEndsOn(ev?.ends_on ?? today);
    setOpeningCash(ev?.opening_cash != null ? String(ev.opening_cash) : '');
    setCashNote(ev?.cash_note ?? '');
    setClosingCash(ev?.closing_cash != null ? String(ev.closing_cash) : '');
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getActiveEvent(), getLocalEvents()]).then(([ev, all]) => {
        if (cancelled) return;
        setActive(ev);
        setAllEvents(all);
        setCreating(ev == null); // no event today -> go straight to create
        fillFrom(ev);
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [fillFrom])
  );

  /** Parse a peso amount; empty -> null, invalid -> null. */
  function parseAmount(v: string): number | null {
    const n = Number(v.replace(/[^0-9.]/g, ''));
    return v.trim() === '' || Number.isNaN(n) ? null : n;
  }

  function startCreate() {
    setCreating(true);
    fillFrom(null);
  }
  function cancelCreate() {
    setCreating(false);
    fillFrom(active);
  }

  async function save() {
    const editing = !creating && active;
    if (name.trim() === '') {
      showToast({ variant: 'error', title: 'Name the event', message: 'An event needs a name.' });
      return;
    }
    const start = startsOn.trim();
    const end = endsOn.trim();
    if (start && !isValidDateKey(start)) {
      showToast({ variant: 'error', title: 'Check the start date', message: 'Use YYYY-MM-DD.' });
      return;
    }
    if (end && !isValidDateKey(end)) {
      showToast({ variant: 'error', title: 'Check the end date', message: 'Use YYYY-MM-DD.' });
      return;
    }
    if (start && end && end < start) {
      showToast({ variant: 'error', title: 'Dates are backwards', message: 'The end date is before the start date.' });
      return;
    }
    // Coop rejects overlapping ranges; block it here first with a friendly message.
    const clash = overlappingEvent(allEvents, start || null, end || null, editing ? active!.event_id : undefined);
    if (clash) {
      showToast({ variant: 'error', title: 'Dates overlap another event', message: `${clash.name} already covers these dates.` });
      return;
    }

    const now = new Date().toISOString();
    await upsertLocalEvent({
      event_id: editing ? active!.event_id : newEventId(),
      name: name.trim(),
      venue: venue.trim() || null,
      city: city.trim() || null,
      organizer: organizer.trim() || null,
      starts_on: start || null,
      ends_on: end || null,
      opening_cash: parseAmount(openingCash),
      closing_cash: editing ? parseAmount(closingCash) : null,
      cash_note: cashNote.trim() || null,
      status: editing ? active!.status : 'active',
      created_at: editing ? active!.created_at : now,
      updated_at: now,
    });
    drainOutbox().catch(() => {});
    showToast({ variant: 'success', title: editing ? 'Event saved' : 'Event created', message: name.trim() });
    router.back();
  }

  if (!loaded) return <SafeAreaView style={styles.container} />;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>{creating ? 'NEW EVENT' : "TODAY'S EVENT"}</Text>
        <Text style={styles.hint}>
          {creating
            ? 'Schedule a bazaar. Set its date range, or leave today for a same-day pop-up.'
            : 'Edit this event and count the drawer. Changes sync to Coop and every device.'}
        </Text>

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

        <View style={styles.datesRow}>
          <View style={styles.dateCol}>
            <Text style={styles.fieldLabel}>Start date</Text>
            <TextInput
              testID="event-start-date"
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={startsOn}
              onChangeText={setStartsOn}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.fieldLabel}>End date</Text>
            <TextInput
              testID="event-end-date"
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={endsOn}
              onChangeText={setEndsOn}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Opening cash float</Text>
        <View style={styles.amountWrap}>
          <Text style={styles.peso}>₱</Text>
          <TextInput
            testID="event-opening-cash"
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            value={openingCash}
            onChangeText={setOpeningCash}
            keyboardType="numeric"
          />
        </View>

        <Text style={styles.fieldLabel}>Cash note <Text style={styles.optional}>optional</Text></Text>
        <TextInput
          style={styles.textInput}
          placeholder="Mostly ₱20s and ₱50s…"
          placeholderTextColor={colors.textMuted}
          value={cashNote}
          onChangeText={setCashNote}
        />

        {!creating && (
          <>
            <Text style={styles.fieldLabel}>Counted at close <Text style={styles.optional}>optional</Text></Text>
            <Text style={styles.hint}>Count the drawer at end of day.</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.peso}>₱</Text>
              <TextInput
                testID="event-closing-cash"
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={closingCash}
                onChangeText={setClosingCash}
                keyboardType="numeric"
              />
            </View>
          </>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={save} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{creating ? 'Create event' : 'Save changes'}</Text>
        </TouchableOpacity>

        {creating && active ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={cancelCreate} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : !creating ? (
          <TouchableOpacity style={styles.secondaryBtn} onPress={startCreate} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Schedule another event</Text>
          </TouchableOpacity>
        ) : null}
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
  fieldLabel: { color: c.textSecondary, fontSize: F.sm, fontWeight: '700', marginTop: 8 },
  textInput: {
    backgroundColor: c.surface, color: c.textPrimary, borderRadius: R.sm, borderWidth: 1,
    borderColor: c.border, paddingVertical: 11, paddingHorizontal: 14, fontSize: F.md,
  },
  datesRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },
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
  secondaryBtn: {
    backgroundColor: c.surface, borderRadius: R.md, borderWidth: 1, borderColor: c.border,
    paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  secondaryBtnText: { color: c.textSecondary, fontSize: F.md, fontWeight: '700' },
});
