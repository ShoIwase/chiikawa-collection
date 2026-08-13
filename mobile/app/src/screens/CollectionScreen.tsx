import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getCollectionItems, setItemOwned, UnauthorizedError } from "../api";
import { IMAGE_BASE_URL } from "../config";
import { useSession } from "../hooks/useSession";
import { bucketOf, CHARACTERS, OTHER_AREA_LABEL, PREFECTURES, type CollectionItem } from "../types";

const ALL = "全て" as const;

export default function CollectionScreen() {
  const { idToken, logout } = useSession();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [characterFilter, setCharacterFilter] = useState<string>(ALL);
  const [areaFilter, setAreaFilter] = useState<string>(ALL);

  const load = useCallback(async () => {
    if (!idToken) return;
    try {
      const result = await getCollectionItems(idToken);
      setItems(result);
      setError(null);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [idToken, logout]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleOwned = async (item: CollectionItem) => {
    if (!idToken) return;
    const nextOwned = !item.Owned;
    // 楽観的更新: 先にローカルを書き換え、失敗したら戻す
    setItems((prev) => prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Owned: nextOwned } : i)));
    try {
      await setItemOwned(item.ItemName, nextOwned, idToken);
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.ItemName === item.ItemName ? { ...i, Owned: item.Owned } : i)));
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const areaOptions = useMemo(() => {
    const present = new Set(items.map(bucketOf));
    const ordered = PREFECTURES.filter((p) => present.has(p));
    return [ALL, ...ordered, ...(present.has(OTHER_AREA_LABEL) ? [OTHER_AREA_LABEL] : [])];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (characterFilter !== ALL && item.Motif !== characterFilter) return false;
      if (areaFilter !== ALL && bucketOf(item) !== areaFilter) return false;
      return true;
    });
  }, [items, characterFilter, areaFilter]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>ちいかわコレクション ({filteredItems.length}/{items.length}件)</Text>
        <Text onPress={logout} style={styles.logout}>ログアウト</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <FilterRow label="キャラ" options={[ALL, ...CHARACTERS]} value={characterFilter} onChange={setCharacterFilter} />
      <FilterRow label="地域" options={areaOptions} value={areaFilter} onChange={setAreaFilter} />

      <FlatList
        data={filteredItems}
        numColumns={3}
        keyExtractor={(item) => item.ItemName}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.cell} onPress={() => toggleOwned(item)}>
            <Image source={{ uri: `${IMAGE_BASE_URL}${item.ImageUrl}` }} style={styles.image} />
            {item.Owned && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>✅</Text>
              </View>
            )}
            <Text style={styles.itemName} numberOfLines={2}>{item.ItemName}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.filterChip, value === opt && styles.filterChipActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.filterChipText, value === opt && styles.filterChipTextActive]}>
            {opt === ALL ? `${label}: 全て` : opt}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 },
  header: { fontSize: 16, fontWeight: "600" },
  logout: { color: "#0066cc" },
  error: { color: "red", paddingHorizontal: 12, paddingBottom: 8 },
  filterRow: { flexGrow: 0, paddingHorizontal: 8, marginBottom: 4 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    marginHorizontal: 4,
  },
  filterChipActive: { backgroundColor: "#0066cc" },
  filterChipText: { fontSize: 13, color: "#333" },
  filterChipTextActive: { color: "#fff" },
  cell: { flex: 1 / 3, padding: 6, alignItems: "center" },
  image: { width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#f5f5f5" },
  badge: { position: "absolute", top: 4, right: 10 },
  badgeText: { fontSize: 16 },
  itemName: { fontSize: 10, textAlign: "center", marginTop: 4 },
});
