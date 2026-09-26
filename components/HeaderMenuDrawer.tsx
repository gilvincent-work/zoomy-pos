import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { F, R, type Palette } from '../constants/theme';

// Upper drawer for the header actions. On narrow screens the row of action icons
// can't fit next to the brand + sync + event chip, so they collapse into a single
// menu button that opens this drawer (a panel that drops from the top). Only used
// in the compact layout; wider screens keep the inline icon row.

export interface HeaderMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

export function HeaderMenuDrawer({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: HeaderMenuItem[];
}) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        {/* Stops a tap on the panel from closing the drawer. */}
        <Pressable style={s.panel} onPress={() => {}}>
          <View style={s.grabber} />
          {items.map((it, i) => (
            <TouchableOpacity
              key={it.label}
              style={[s.row, i < items.length - 1 && s.rowDivider]}
              onPress={() => {
                onClose();
                it.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={it.label}
            >
              <Ionicons name={it.icon} size={20} color={colors.textPrimary} />
              <Text style={s.label}>{it.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={s.chevron} />
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TOP_INSET = Platform.OS === 'ios' ? 47 : (StatusBar.currentHeight ?? 12);

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start' },
    panel: {
      backgroundColor: c.surface,
      paddingTop: TOP_INSET + 4,
      paddingBottom: 8,
      borderBottomLeftRadius: R.lg,
      borderBottomRightRadius: R.lg,
      borderBottomWidth: 1,
      borderColor: c.borderDark,
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderDark, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.borderDark },
    label: { color: c.textPrimary, fontSize: F.md, fontWeight: '600' },
    chevron: { marginLeft: 'auto' },
  });
