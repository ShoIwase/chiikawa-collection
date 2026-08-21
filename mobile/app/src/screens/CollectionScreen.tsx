import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCollectionItems, getPendingItems, setItemOwned, setItemTags, UnauthorizedError } from "../api";
import AlertBanner from "../components/AlertBanner";
import FilterBar, { type SortKey } from "../components/FilterBar";
import ImageLightbox from "../components/ImageLightbox";
import TagEditor from "../components/TagEditor";
import { IMAGE_BASE_URL } from "../config";
import { formatDateTimeJst, splitItemDisplay } from "../format";
import { useSession } from "../hooks/useSession";
import type { RootStackParamList } from "../navigation";
import { characterColor, colors } from "../theme";
import {
  bucketOf,
  CHARACTERS,
  FAV_TAG,
  OTHER_AREA_LABEL,
  PREFECTURES,
  WANT_TAG,
  type CollectionItem,
} from "../types";

type Group = { label: string; items: CollectionItem[] };

export default function CollectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Collection">>();
  const { idToken, logout } = useSession();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 選択→保存の2段階フロー(誤タップ防止のため、タップだけではサーバーに反映しない)
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [showUnownedOnly, setShowUnownedOnly] = useState(false);
  const [showWanted, setShowWanted] = useState(false);
  const [showFavorite, setShowFavorite] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("area");

  const [zoomedImage, setZoomedImage] = useState<{ src: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);

  const load = useCallback(async () => {
    if (!idToken) return;
    try {
      const [col, pend] = await Promise.all([getCollectionItems(idToken), getPendingItems(idToken)]);
      setItems(col);
      setPendingCount(pend.length);
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [idToken, logout]);

  // Scan画面から戻ってきたときも最新の状態を取り直す
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const itemsByName = useMemo(() => {
    const m = new Map<string, CollectionItem>();
    items.forEach((i) => m.set(i.ItemName, i));
    return m;
  }, [items]);

  // タップはローカルの保留状態(pending)を切り替えるだけ。サーバー反映は「保存」ボタンで確定する
  const handleToggleLocal = useCallback((item: CollectionItem) => {
    const name = item.ItemName;
    const server = itemsByName.get(name)?.Owned ?? false;
    setPending((prev) => {
      const current = name in prev ? prev[name] : server;
      const next = !current;
      const np = { ...prev };
      if (next === server) delete np[name];
      else np[name] = next;
      return np;
    });
  }, [itemsByName]);

  const handleSave = async () => {
    if (!idToken) return;
    const entries = Object.entries(pending);
    if (entries.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const succeeded: string[] = [];
    try {
      for (const [name, owned] of entries) {
        await setItemOwned(name, owned, idToken);
        succeeded.push(name);
      }
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.ItemName in pending ? { ...i, Owned: pending[i.ItemName], UpdatedAt: now } : i)));
      setPending({});
    } catch (e) {
      setItems((prev) => prev.map((i) => (succeeded.includes(i.ItemName) ? { ...i, Owned: pending[i.ItemName] } : i)));
      setPending((prev) => {
        const np = { ...prev };
        succeeded.forEach((n) => delete np[n]);
        return np;
      });
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setSaveError("一部の保存に失敗しました。もう一度お試しください");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPending({});
    setSaveError(null);
  };

  // ❤️/⭐は保存ボタンを介さず即時反映
  const toggleSpecialTag = useCallback(async (item: CollectionItem, tagName: string) => {
    if (!idToken) return;
    const current = item.Tags ?? [];
    const next = current.includes(tagName) ? current.filter((t) => t !== tagName) : [...current, tagName];
    setItems((prev) => prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Tags: next } : i)));
    try {
      await setItemTags(item.ItemName, next, idToken);
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Tags: current } : i)));
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [idToken, logout]);

  const handleSaveTags = async (tags: string[]) => {
    if (!idToken || !editingItem) return;
    await setItemTags(editingItem.ItemName, tags, idToken);
    setItems((prev) => prev.map((i) => (i.ItemName === editingItem.ItemName ? { ...i, Tags: tags } : i)));
  };

  // ItemCardをReact.memoで再レンダーを抑えるため、コールバックはitemを引数に取る安定した参照にする
  const handleZoom = useCallback(
    (item: CollectionItem) => setZoomedImage({ src: `${IMAGE_BASE_URL}${item.ImageUrl}`, alt: item.ItemName }),
    []
  );
  const handleToggleWant = useCallback((item: CollectionItem) => toggleSpecialTag(item, WANT_TAG), [toggleSpecialTag]);
  const handleToggleFav = useCallback((item: CollectionItem) => toggleSpecialTag(item, FAV_TAG), [toggleSpecialTag]);

  const displayItems = useMemo(
    () => items.map((i) => (i.ItemName in pending ? { ...i, Owned: pending[i.ItemName] } : i)),
    [items, pending]
  );
  const dirtyNames = useMemo(() => new Set(Object.keys(pending)), [pending]);
  const dirtyCount = dirtyNames.size;

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return displayItems.filter((item) => {
      if (selectedTags.length > 0 && !selectedTags.every((t) => item.Tags?.includes(t))) return false;
      if (selectedPrefecture && bucketOf(item) !== selectedPrefecture) return false;
      if (selectedCity && item.AreaName !== selectedCity) return false;
      if (selectedCharacters.length > 0 && !selectedCharacters.includes(item.Motif)) return false;
      if (showUnownedOnly && item.Owned) return false;
      if (showWanted && !item.Tags?.includes(WANT_TAG)) return false;
      if (showFavorite && !item.Tags?.includes(FAV_TAG)) return false;
      if (q) {
        const hay = [item.ItemName, item.Motif, item.AreaName, item.Prefecture, ...(item.Tags ?? [])].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [displayItems, selectedTags, selectedPrefecture, selectedCity, selectedCharacters, searchText, showUnownedOnly, showWanted, showFavorite]);

  const prefRank = useMemo(() => new Map<string, number>(PREFECTURES.map((p, i) => [p, i])), []);
  const charRank = useMemo(() => new Map<string, number>(CHARACTERS.map((c, i) => [c, i])), []);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "name":
        return arr.sort((a, b) => a.ItemName.localeCompare(b.ItemName, "ja"));
      case "area":
        return arr.sort((a, b) => {
          const ra = prefRank.get(a.Prefecture ?? "") ?? 999;
          const rb = prefRank.get(b.Prefecture ?? "") ?? 999;
          if (ra !== rb) return ra - rb;
          const areaComp = a.AreaName.localeCompare(b.AreaName, "ja");
          if (areaComp !== 0) return areaComp;
          return (charRank.get(a.Motif) ?? 999) - (charRank.get(b.Motif) ?? 999);
        });
      case "character":
        return arr.sort((a, b) => {
          const ra = charRank.get(a.Motif) ?? 999;
          const rb = charRank.get(b.Motif) ?? 999;
          if (ra !== rb) return ra - rb;
          return a.AreaName.localeCompare(b.AreaName, "ja");
        });
      case "owned-first":
        return arr.sort((a, b) => Number(b.Owned) - Number(a.Owned));
      case "unowned-first":
        return arr.sort((a, b) => Number(a.Owned) - Number(b.Owned));
      default:
        return arr;
    }
  }, [filtered, sortKey, prefRank, charRank]);

  // 「地域順」のときだけ都道府県ごとにグルーピングして見出しを出す(frontendと同じ)
  const groups = useMemo<Group[]>(() => {
    if (sortKey !== "area") return [{ label: "", items: sorted }];
    const groupsArr: Group[] = [];
    for (const item of sorted) {
      const label = bucketOf(item);
      const last = groupsArr[groupsArr.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groupsArr.push({ label, items: [item] });
    }
    return groupsArr;
  }, [sorted, sortKey]);

  const ownedCount = displayItems.filter((i) => i.Owned).length;
  const ownedNames = useMemo(() => items.filter((i) => i.Owned).map((i) => i.ItemName), [items]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>🐾 ご当地ちいかわコレクション</Text>
          <Text style={styles.subtitle}>{ownedCount} / {items.length} 個所持</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>ログアウト</Text>
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <AlertBanner count={pendingCount} onPress={() => navigation.navigate("Verify")} />

      <View style={styles.filterBarWrap}>
        <FilterBar
          items={items}
          searchText={searchText}
          selectedTags={selectedTags}
          selectedPrefecture={selectedPrefecture}
          selectedCity={selectedCity}
          selectedCharacters={selectedCharacters}
          showUnownedOnly={showUnownedOnly}
          showWanted={showWanted}
          showFavorite={showFavorite}
          sortKey={sortKey}
          onSearchTextChange={setSearchText}
          onTagToggle={(tag) => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
          onPrefectureChange={(v) => { setSelectedPrefecture(v); setSelectedCity(""); }}
          onCityChange={setSelectedCity}
          onCharacterToggle={(c) => setSelectedCharacters((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))}
          onShowUnownedOnlyChange={setShowUnownedOnly}
          onShowWantedChange={setShowWanted}
          onShowFavoriteChange={setShowFavorite}
          onSortKeyChange={setSortKey}
          onClearAll={() => {
            setSearchText("");
            setSelectedTags([]);
            setSelectedPrefecture("");
            setSelectedCity("");
            setSelectedCharacters([]);
            setShowUnownedOnly(false);
            setShowWanted(false);
            setShowFavorite(false);
          }}
        />
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g, i) => g.label || `all-${i}`}
        contentContainerStyle={[styles.list, dirtyCount > 0 && { paddingBottom: 90 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.pink400} />}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        renderItem={({ item: group }) => (
          <View>
            {group.label !== "" && (
              <View style={styles.groupHeader}>
                <Text style={styles.groupHeaderText}>{group.label}</Text>
                <Text style={styles.groupHeaderCount}>{group.items.length}件</Text>
              </View>
            )}
            <View style={styles.groupGrid}>
              {group.items.map((item) => (
                <ItemCard
                  key={item.ItemName}
                  item={item}
                  dirty={dirtyNames.has(item.ItemName)}
                  onToggle={handleToggleLocal}
                  onZoom={handleZoom}
                  onEditTags={setEditingItem}
                  onToggleWant={handleToggleWant}
                  onToggleFav={handleToggleFav}
                />
              ))}
            </View>
          </View>
        )}
      />

      {dirtyCount > 0 && (
        <View style={styles.saveBar}>
          {saveError && <Text style={styles.error}>{saveError}</Text>}
          <View style={styles.saveBarRow}>
            <Text style={styles.saveBarText}><Text style={styles.saveBarCount}>{dirtyCount}件</Text> の未保存の変更</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={saving}>
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.saveButtonText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={[styles.fabColumn, dirtyCount > 0 && { bottom: 96 }]}>
        <TouchableOpacity style={styles.scanFab} onPress={() => navigation.navigate("Scan", { ownedNames })}>
          <Text style={styles.scanFabText}>📷 スキャン</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.statsFab} onPress={() => navigation.navigate("Stats")}>
          <Text style={styles.statsFabText}>📊 集計</Text>
        </TouchableOpacity>
      </View>

      {zoomedImage && <ImageLightbox src={zoomedImage.src} alt={zoomedImage.alt} onClose={() => setZoomedImage(null)} />}

      {editingItem && idToken && (
        <TagEditor
          item={editingItem}
          allTags={[...new Set(items.flatMap((i) => i.Tags ?? []).filter((t) => t !== WANT_TAG && t !== FAV_TAG))].sort()}
          onSave={handleSaveTags}
          onClose={() => setEditingItem(null)}
        />
      )}
    </SafeAreaView>
  );
}

const ItemCard = memo(function ItemCard({
  item,
  dirty,
  onToggle,
  onZoom,
  onEditTags,
  onToggleWant,
  onToggleFav,
}: {
  item: CollectionItem;
  dirty: boolean;
  onToggle: (item: CollectionItem) => void;
  onZoom: (item: CollectionItem) => void;
  onEditTags: (item: CollectionItem) => void;
  onToggleWant: (item: CollectionItem) => void;
  onToggleFav: (item: CollectionItem) => void;
}) {
  const { motif, detail } = splitItemDisplay(item);
  const charColor = characterColor(item.Motif);
  const isWanted = item.Tags?.includes(WANT_TAG) ?? false;
  const isFav = item.Tags?.includes(FAV_TAG) ?? false;
  const otherTags = (item.Tags ?? []).filter((t) => t !== WANT_TAG && t !== FAV_TAG && t !== item.Motif && t !== item.AreaName).slice(0, 2);

  return (
    <View style={[styles.cell, dirty ? styles.cellDirty : item.Owned && styles.cellOwned]}>
      <TouchableOpacity onPress={() => onToggle(item)} activeOpacity={0.85}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: `${IMAGE_BASE_URL}${item.ImageUrl}` }}
            style={[styles.image, !item.Owned && styles.imageDim]}
            cachePolicy="memory-disk"
            transition={100}
            recyclingKey={item.ItemName}
          />
          {dirty ? (
            <View style={[styles.badge, styles.badgeDirty]}>
              <Text style={styles.badgeText}>未保存</Text>
            </View>
          ) : item.Owned ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>✓ 所持</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.zoomButton} onPress={() => onZoom(item)}>
            <Text style={styles.zoomButtonText}>🔍</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <View style={[styles.characterPill, { backgroundColor: charColor.bg }]}>
        <Text style={[styles.characterPillText, { color: charColor.text }]}>{motif}</Text>
      </View>
      <Text style={styles.detail} numberOfLines={2}>{detail}</Text>
      {otherTags.length > 0 && (
        <View style={styles.tagRow}>
          {otherTags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagChipText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
      {item.Owned && item.UpdatedAt && <Text style={styles.timestamp}>{formatDateTimeJst(item.UpdatedAt)}</Text>}

      <View style={styles.actionRow}>
        <TouchableOpacity onPress={() => onToggleWant(item)}><Text style={styles.actionIcon}>{isWanted ? "❤️" : "🤍"}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onToggleFav(item)}><Text style={styles.actionIcon}>{isFav ? "⭐" : "☆"}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onEditTags(item)}><Text style={styles.actionIcon}>✏️</Text></TouchableOpacity>
      </View>
    </View>
  );
});

const CELL_WIDTH = "33.3%";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pink50 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, paddingBottom: 8 },
  title: { fontSize: 19, fontWeight: "700", color: colors.pink500 },
  subtitle: { fontSize: 12, color: colors.gray400, marginTop: 2 },
  logout: { fontSize: 12, color: colors.gray400, textDecorationLine: "underline" },
  error: { color: colors.red500, paddingHorizontal: 16, paddingBottom: 8, fontSize: 13 },

  filterBarWrap: { paddingHorizontal: 16, marginBottom: 4 },

  list: { paddingHorizontal: 12, paddingBottom: 24 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.pink400,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
  },
  groupHeaderText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  groupHeaderCount: { color: colors.pink100, fontSize: 12 },
  groupGrid: { flexDirection: "row", flexWrap: "wrap" },

  cell: { width: CELL_WIDTH, padding: 5, borderRadius: 16 },
  cellOwned: { borderWidth: 2, borderColor: colors.pink400 },
  cellDirty: { borderWidth: 2, borderColor: colors.amber400 },
  imageWrap: { aspectRatio: 1, borderRadius: 14, overflow: "hidden", backgroundColor: colors.gray100 },
  image: { width: "100%", height: "100%" },
  imageDim: { opacity: 0.45 },
  badge: { position: "absolute", top: 6, left: 6, backgroundColor: colors.pink500, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeDirty: { backgroundColor: colors.amber400 },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  zoomButton: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 999, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  zoomButtonText: { fontSize: 11 },

  characterPill: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 5 },
  characterPillText: { fontSize: 11, fontWeight: "700" },
  detail: { fontSize: 12, color: colors.gray700, marginTop: 2, lineHeight: 15 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  tagChip: { backgroundColor: colors.pink50, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tagChipText: { fontSize: 10, color: colors.pink600 },
  timestamp: { fontSize: 10, color: colors.gray400, marginTop: 3 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  actionIcon: { fontSize: 14 },

  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.pink100,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  saveBarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  saveBarText: { fontSize: 13, color: colors.gray600 },
  saveBarCount: { color: colors.pink600, fontWeight: "700" },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.gray300 },
  cancelButtonText: { fontSize: 13, color: colors.gray600 },
  saveButton: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.pink500 },
  saveButtonText: { fontSize: 13, color: colors.white, fontWeight: "600" },

  fabColumn: { position: "absolute", right: 16, bottom: 20, gap: 8, alignItems: "flex-end" },
  scanFab: {
    backgroundColor: colors.pink500,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  scanFabText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  statsFab: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  statsFabText: { color: colors.gray700, fontWeight: "600", fontSize: 14 },
});
