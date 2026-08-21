import { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors } from "../theme";
import {
  bucketOf,
  CHARACTERS,
  FAV_TAG,
  OTHER_AREA_LABEL,
  PREFECTURES,
  WANT_TAG,
  type CollectionItem,
} from "../types";

export type SortKey = "name" | "area" | "character" | "owned-first" | "unowned-first";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "名前順" },
  { key: "area", label: "地域順" },
  { key: "character", label: "キャラ順" },
  { key: "owned-first", label: "所持済み優先" },
  { key: "unowned-first", label: "未所持優先" },
];

type Props = {
  items: CollectionItem[];
  searchText: string;
  selectedTags: string[];
  selectedPrefecture: string;
  selectedCity: string;
  selectedCharacters: string[];
  showUnownedOnly: boolean;
  showWanted: boolean;
  showFavorite: boolean;
  sortKey: SortKey;
  onSearchTextChange: (v: string) => void;
  onTagToggle: (tag: string) => void;
  onPrefectureChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onCharacterToggle: (c: string) => void;
  onShowUnownedOnlyChange: (v: boolean) => void;
  onShowWantedChange: (v: boolean) => void;
  onShowFavoriteChange: (v: boolean) => void;
  onSortKeyChange: (v: SortKey) => void;
  onClearAll: () => void;
};

export default function FilterBar({
  items,
  searchText,
  selectedTags,
  selectedPrefecture,
  selectedCity,
  selectedCharacters,
  showUnownedOnly,
  showWanted,
  showFavorite,
  sortKey,
  onSearchTextChange,
  onTagToggle,
  onPrefectureChange,
  onCityChange,
  onCharacterToggle,
  onShowUnownedOnlyChange,
  onShowWantedChange,
  onShowFavoriteChange,
  onSortKeyChange,
  onClearAll,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.Tags?.forEach((t) => { if (t !== WANT_TAG && t !== FAV_TAG) set.add(t); }));
    return [...set].sort();
  }, [items]);

  const prefsPresent = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(bucketOf(i)));
    const ordered: string[] = PREFECTURES.filter((p) => set.has(p));
    if (set.has(OTHER_AREA_LABEL)) ordered.push(OTHER_AREA_LABEL);
    return ordered;
  }, [items]);

  const citiesInPref = useMemo(() => {
    if (!selectedPrefecture) return [];
    const set = new Set<string>();
    items.forEach((i) => {
      if (bucketOf(i) !== selectedPrefecture) return;
      if (i.AreaType === "都道府県") return;
      if (i.AreaName) set.add(i.AreaName);
    });
    return [...set].sort();
  }, [items, selectedPrefecture]);

  const activeCount =
    selectedTags.length +
    (selectedPrefecture ? 1 : 0) +
    (selectedCity ? 1 : 0) +
    selectedCharacters.length +
    (showUnownedOnly ? 1 : 0) +
    (showWanted ? 1 : 0) +
    (showFavorite ? 1 : 0);
  const hasAnyFilter = !!searchText || activeCount > 0;

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...selectedCharacters.map((c) => ({ key: `char:${c}`, label: c, onRemove: () => onCharacterToggle(c) })),
    ...(selectedPrefecture ? [{ key: "pref", label: selectedPrefecture, onRemove: () => onPrefectureChange("") }] : []),
    ...(selectedCity ? [{ key: "city", label: selectedCity, onRemove: () => onCityChange("") }] : []),
    ...selectedTags.map((t) => ({ key: `tag:${t}`, label: `#${t}`, onRemove: () => onTagToggle(t) })),
    ...(showWanted ? [{ key: "wanted", label: "❤️ 欲しい", onRemove: () => onShowWantedChange(false) }] : []),
    ...(showFavorite ? [{ key: "fav", label: "⭐ お気に入り", onRemove: () => onShowFavoriteChange(false) }] : []),
    ...(showUnownedOnly ? [{ key: "unowned", label: "未所持のみ", onRemove: () => onShowUnownedOnlyChange(false) }] : []),
  ];

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "並べ替え";
  const unselectedTags = allTags.filter((t) => !selectedTags.includes(t));

  return (
    <View style={{ gap: 8 }}>
      {/* 行1: 検索 + 並べ替え + 絞り込みトグル(Web版と同じ構成) */}
      <View style={styles.row1}>
        <TextInput
          style={styles.searchInput}
          placeholder="名前・エリアで検索"
          placeholderTextColor={colors.gray400}
          value={searchText}
          onChangeText={onSearchTextChange}
        />
        <SelectButton
          label={sortLabel}
          onPress={() => {}}
          render={(close) => (
            <SelectSheet
              title="並べ替え"
              options={SORT_OPTIONS.map((o) => o.label)}
              selected={sortLabel}
              onSelect={(label) => {
                const opt = SORT_OPTIONS.find((o) => o.label === label);
                if (opt) onSortKeyChange(opt.key);
                close();
              }}
            />
          )}
        />
        <TouchableOpacity
          style={[styles.filterToggle, activeCount > 0 && styles.filterToggleActive]}
          onPress={() => setExpanded((v) => !v)}
        >
          <Text style={[styles.filterToggleText, activeCount > 0 && styles.filterToggleTextActive]}>
            絞り込み{activeCount > 0 ? ` (${activeCount})` : ""} {expanded ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.panel}>
          <FilterSection label="エリア">
            <View style={styles.chipInner}>
              <SelectButton
                label={selectedPrefecture || "都道府県"}
                filled={!!selectedPrefecture}
                render={(close) => (
                  <SelectSheet
                    title="都道府県"
                    options={prefsPresent}
                    selected={selectedPrefecture}
                    clearLabel="都道府県(指定なし)"
                    onSelect={(v) => { onPrefectureChange(v); close(); }}
                  />
                )}
              />
              <SelectButton
                label={selectedCity || "市区町村"}
                filled={!!selectedCity}
                disabled={!selectedPrefecture || citiesInPref.length === 0}
                render={(close) => (
                  <SelectSheet
                    title="市区町村"
                    options={citiesInPref}
                    selected={selectedCity}
                    clearLabel="市区町村(指定なし)"
                    onSelect={(v) => { onCityChange(v); close(); }}
                  />
                )}
              />
            </View>
          </FilterSection>

          <FilterSection label="キャラ">
            <ChipRow options={[...CHARACTERS]} selected={selectedCharacters} onToggle={onCharacterToggle} />
          </FilterSection>

          {allTags.length > 0 && (
            <FilterSection label="タグ">
              <SelectButton
                label="タグを追加..."
                render={(close) => (
                  <SelectSheet
                    title="タグを追加"
                    options={unselectedTags}
                    selected=""
                    onSelect={(v) => { onTagToggle(v); close(); }}
                  />
                )}
              />
            </FilterSection>
          )}

          <FilterSection label="その他">
            <View style={styles.chipInner}>
              <ToggleChip label="❤️ 欲しい" active={showWanted} onPress={() => onShowWantedChange(!showWanted)} />
              <ToggleChip label="⭐ お気に入り" active={showFavorite} onPress={() => onShowFavoriteChange(!showFavorite)} />
              <ToggleChip label="未所持のみ" active={showUnownedOnly} onPress={() => onShowUnownedOnlyChange(!showUnownedOnly)} />
            </View>
          </FilterSection>

          {hasAnyFilter && (
            <TouchableOpacity onPress={() => { onClearAll(); setExpanded(false); }}>
              <Text style={styles.clearAll}>すべてクリア</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {activeChips.length > 0 && (
        <View style={styles.chipInner}>
          {activeChips.map((chip) => (
            <View key={chip.key} style={styles.activeChip}>
              <Text style={styles.activeChipText}>{chip.label}</Text>
              <TouchableOpacity onPress={chip.onRemove}>
                <Text style={styles.activeChipRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// タップでモーダルの選択肢一覧を開く、Web版の <select> 相当のボタン
function SelectButton({
  label,
  filled,
  disabled,
  render,
}: {
  label: string;
  filled?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  render: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        style={[styles.selectButton, filled && styles.selectButtonFilled, disabled && styles.selectButtonDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Text style={[styles.selectButtonText, disabled && styles.selectButtonTextDisabled]} numberOfLines={1}>{label}</Text>
        <Text style={styles.selectChevron}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>{render(() => setOpen(false))}</View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function SelectSheet({
  title,
  options,
  selected,
  clearLabel,
  onSelect,
}: {
  title: string;
  options: string[];
  selected: string;
  clearLabel?: string;
  onSelect: (v: string) => void;
}) {
  return (
    <View>
      <Text style={styles.sheetTitle}>{title}</Text>
      <ScrollView style={{ maxHeight: 360 }}>
        {clearLabel && (
          <TouchableOpacity style={styles.sheetOption} onPress={() => onSelect("")}>
            <Text style={styles.sheetOptionText}>{clearLabel}</Text>
          </TouchableOpacity>
        )}
        {options.map((opt) => (
          <TouchableOpacity key={opt} style={styles.sheetOption} onPress={() => onSelect(opt)}>
            <Text style={[styles.sheetOptionText, selected === opt && styles.sheetOptionTextActive]}>
              {opt}{selected === opt ? " ✓" : ""}
            </Text>
          </TouchableOpacity>
        ))}
        {options.length === 0 && <Text style={styles.sheetEmptyText}>選択肢がありません</Text>}
      </ScrollView>
    </View>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View style={styles.chipInner}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity key={opt} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => onToggle(opt)}>
            <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.optionChip, active && styles.optionChipActive]} onPress={onPress}>
      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row1: { flexDirection: "row", gap: 6, alignItems: "center" },
  searchInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  filterToggle: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray300, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  filterToggleActive: { borderColor: colors.pink400, backgroundColor: colors.pink50 },
  filterToggleText: { fontSize: 12, color: colors.gray700 },
  filterToggleTextActive: { color: colors.pink600, fontWeight: "600" },

  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 110,
  },
  selectButtonFilled: { borderColor: colors.pink400, backgroundColor: colors.pink50 },
  selectButtonDisabled: { backgroundColor: colors.gray100 },
  selectButtonText: { fontSize: 12, color: colors.gray700 },
  selectButtonTextDisabled: { color: colors.gray400 },
  selectChevron: { fontSize: 10, color: colors.gray400 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 32 },
  modalSheet: { backgroundColor: colors.white, borderRadius: 16, padding: 16 },
  sheetTitle: { fontSize: 14, fontWeight: "700", color: colors.gray700, marginBottom: 8 },
  sheetOption: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  sheetOptionText: { fontSize: 14, color: colors.gray700 },
  sheetOptionTextActive: { color: colors.pink600, fontWeight: "700" },
  sheetEmptyText: { fontSize: 13, color: colors.gray400, paddingVertical: 8 },

  panel: { backgroundColor: colors.gray100, borderRadius: 12, padding: 12, gap: 10 },
  sectionLabel: { fontSize: 11, color: colors.gray400, fontWeight: "600" },
  chipInner: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  optionChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray300 },
  optionChipActive: { backgroundColor: colors.pink400, borderColor: colors.pink400 },
  optionChipText: { fontSize: 12, color: colors.gray700 },
  optionChipTextActive: { color: colors.white, fontWeight: "600" },
  clearAll: { fontSize: 12, color: colors.gray400, textDecorationLine: "underline" },

  activeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.pink100, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeChipText: { fontSize: 11, color: colors.pink600, fontWeight: "500" },
  activeChipRemove: { fontSize: 13, color: colors.pink400 },
});
