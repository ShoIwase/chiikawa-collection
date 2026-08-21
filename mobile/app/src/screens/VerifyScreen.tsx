import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPendingItems, UnauthorizedError, verifyItem } from "../api";
import { IMAGE_BASE_URL } from "../config";
import { useSession } from "../hooks/useSession";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { AREA_TYPES, type MasterItem } from "../types";

export default function VerifyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Verify">>();
  const { idToken, logout } = useSession();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<number | null>(null);

  const [areaType, setAreaType] = useState("");
  const [areaName, setAreaName] = useState("");
  const [motif, setMotif] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!idToken) return;
    getPendingItems(idToken)
      .then(setItems)
      .catch((e) => {
        if (e instanceof UnauthorizedError) {
          logout();
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [idToken, logout]);

  const current = items[currentIndex];

  useEffect(() => {
    if (current) {
      setAreaType(current.AreaType);
      setAreaName(current.AreaName);
      setMotif(current.Motif);
    }
  }, [current]);

  const advance = () => {
    if (currentIndex + 1 >= items.length) navigation.goBack();
    else setCurrentIndex((i) => i + 1);
  };

  const handleConfirm = async () => {
    if (!idToken || !current) return;
    setConfirming(true);
    try {
      await verifyItem(current.ItemName, { areaType, areaName, motif }, idToken);
      advance();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        logout();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!idToken) return;
    setBulkProgress(0);
    const CHUNK = 5;
    for (let i = 0; i < items.length; i += CHUNK) {
      await Promise.all(
        items.slice(i, i + CHUNK).map((item) =>
          verifyItem(item.ItemName, { areaType: item.AreaType, areaName: item.AreaName, motif: item.Motif }, idToken).catch(() => {})
        )
      );
      setBulkProgress(Math.min(i + CHUNK, items.length));
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>新着アイテムの確認</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.pink400} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && items.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyText}>未確認のアイテムはありません</Text>
        </View>
      )}

      {!loading && items.length > 0 && (
        <Text style={styles.progressText}>{currentIndex + 1} / {items.length} 件</Text>
      )}

      {current && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>アイテムを確認</Text>
          <Text style={styles.itemName} numberOfLines={2}>{current.ItemName}</Text>

          <Image source={{ uri: `${IMAGE_BASE_URL}${current.ImageUrl}` }} style={styles.preview} contentFit="contain" cachePolicy="memory-disk" />

          <Text style={styles.label}>モチーフ</Text>
          <TextInput style={styles.input} value={motif} onChangeText={setMotif} />

          <Text style={styles.label}>エリア種別</Text>
          <View style={styles.chipRow}>
            {AREA_TYPES.map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, areaType === t && styles.chipActive]} onPress={() => setAreaType(t)}>
                <Text style={[styles.chipText, areaType === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>エリア名</Text>
          <TextInput style={styles.input} value={areaName} onChangeText={setAreaName} />

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirm}
            disabled={confirming || !areaType || !areaName}
          >
            {confirming ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>確定</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={advance}>
            <Text style={styles.skipButtonText}>スキップ</Text>
          </TouchableOpacity>

          {bulkProgress == null ? (
            <TouchableOpacity style={styles.bulkButton} onPress={handleBulkApprove}>
              <Text style={styles.bulkButtonText}>すべてそのまま確定(残り {items.length - currentIndex} 件)</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: 12 }}>
              <View style={styles.bulkTrack}>
                <View style={[styles.bulkFill, { width: `${(bulkProgress / items.length) * 100}%` }]} />
              </View>
              <Text style={styles.bulkText}>{bulkProgress} / {items.length} 件処理中...</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  backButton: { fontSize: 13, color: colors.gray400 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.gray700 },
  error: { color: colors.red500, paddingHorizontal: 16, fontSize: 13 },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: colors.gray400, fontSize: 14 },
  progressText: { textAlign: "center", fontSize: 13, color: colors.gray600, marginBottom: 12 },

  card: { marginHorizontal: 20, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.gray100, padding: 20 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.gray700 },
  itemName: { fontSize: 12, color: colors.gray600, marginBottom: 12 },
  preview: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.gray100, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "600", color: colors.gray400, marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray300 },
  chipActive: { backgroundColor: colors.pink400, borderColor: colors.pink400 },
  chipText: { fontSize: 12, color: colors.gray700 },
  chipTextActive: { color: colors.white, fontWeight: "600" },

  confirmButton: { backgroundColor: colors.pink400, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  confirmButtonText: { color: colors.white, fontWeight: "700", fontSize: 15 },
  skipButton: { paddingVertical: 10, alignItems: "center" },
  skipButtonText: { color: colors.gray400, fontSize: 13 },
  bulkButton: { borderWidth: 1, borderColor: colors.gray300, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  bulkButtonText: { fontSize: 11, color: colors.gray400 },
  bulkTrack: { height: 6, borderRadius: 999, backgroundColor: colors.gray100, overflow: "hidden" },
  bulkFill: { height: "100%", backgroundColor: colors.pink400 },
  bulkText: { fontSize: 11, color: colors.gray400, textAlign: "center", marginTop: 4 },
});
