import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { scanPhoto, setItemOwned, type ScanMatchedItem } from "../api";
import { IMAGE_BASE_URL } from "../config";
import { useSession } from "../hooks/useSession";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";

const MAX_PX = 1600;
const CHAR_ORDER: Record<string, number> = { "ちいかわ": 0, "ハチワレ": 1, "うさぎ": 2 };

async function resizeAndEncode(uri: string, width: number, height: number) {
  const scale = Math.min(1, MAX_PX / Math.max(width, height));
  const actions = scale < 1 ? [{ resize: { width: Math.round(width * scale) } }] : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) throw new Error("画像の変換に失敗しました");
  return { base64: result.base64, mimeType: "image/jpeg" };
}

export default function ScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Scan">>();
  const route = useRoute<RouteProp<RootStackParamList, "Scan">>();
  const ownedNames = useMemo(() => new Set(route.params.ownedNames), [route.params]);
  const { idToken } = useSession();

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [matched, setMatched] = useState<ScanMatchedItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetResult = () => {
    setAreas([]);
    setMatched([]);
    setChecked(new Set());
    setCollapsed(new Set());
  };

  const handleAsset = async (uri: string, width: number, height: number) => {
    if (!idToken) return;
    setScanError(null);
    resetResult();
    setPreviewUri(uri);
    setScanning(true);
    try {
      const { base64, mimeType } = await resizeAndEncode(uri, width, height);
      const result = await scanPhoto(base64, mimeType, idToken);
      setAreas(result.areas);

      const sorted = [...result.matched].sort(
        (a, b) =>
          a.areaName.localeCompare(b.areaName, "ja") ||
          a.itemDetail.localeCompare(b.itemDetail, "ja") ||
          (CHAR_ORDER[a.motif] ?? 9) - (CHAR_ORDER[b.motif] ?? 9)
      );
      setMatched(sorted);

      // 商品まで特定できた未所持のものだけ初期チェック(地域のみの候補は誤登録防止で外す)
      setChecked(
        new Set(sorted.filter((i) => i.confidence !== "area" && !ownedNames.has(i.itemName)).map((i) => i.itemName))
      );
      const lowAreas = [...new Set(sorted.map((i) => i.areaName))].filter((area) =>
        sorted.filter((i) => i.areaName === area).every((i) => i.confidence === "area")
      );
      setCollapsed(new Set(lowAreas));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "スキャンに失敗しました");
    } finally {
      setScanning(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setScanError("カメラの権限が必要です");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      handleAsset(a.uri, a.width, a.height);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setScanError("写真ライブラリの権限が必要です");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      handleAsset(a.uri, a.width, a.height);
    }
  };

  const clearPhoto = () => {
    setPreviewUri(null);
    setScanError(null);
    resetResult();
  };

  const toggleItem = (name: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleMany = (targetItems: ScanMatchedItem[]) => {
    const names = targetItems.filter((i) => !ownedNames.has(i.itemName)).map((i) => i.itemName);
    if (names.length === 0) return;
    const allChecked = names.every((n) => checked.has(n));
    setChecked((prev) => {
      const next = new Set(prev);
      names.forEach((n) => (allChecked ? next.delete(n) : next.add(n)));
      return next;
    });
  };

  const toggleCollapsed = (areaName: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(areaName)) next.delete(areaName);
      else next.add(areaName);
      return next;
    });
  };

  const handleSave = async () => {
    if (!idToken) return;
    const names = [...checked];
    if (names.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all(names.map((name) => setItemOwned(name, true, idToken)));
      navigation.goBack();
    } catch {
      setSaveError("一部の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const groupedAreas = [...new Set(matched.map((i) => i.areaName))];
  const unownedCount = matched.filter((i) => !ownedNames.has(i.itemName)).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>写真でスキャン</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.close}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {!previewUri ? (
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickButton} onPress={pickFromCamera}>
              <Text style={styles.pickButtonText}>📷{"\n"}カメラで撮影</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickButton} onPress={pickFromLibrary}>
              <Text style={styles.pickButtonText}>🖼️{"\n"}写真を選ぶ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Image source={{ uri: previewUri }} style={styles.preview} contentFit="contain" />
            <TouchableOpacity style={styles.clearButton} onPress={clearPhoto}>
              <Text style={styles.clearButtonText}>別の写真</Text>
            </TouchableOpacity>
          </View>
        )}

        {scanning && (
          <View style={styles.scanningRow}>
            <ActivityIndicator color={colors.pink400} />
            <Text style={styles.scanningText}>スキャン中...</Text>
          </View>
        )}

        {scanError && <Text style={styles.error}>{scanError}</Text>}

        {!scanning && matched.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={styles.summary}>
              {areas.length}件を認識 · 該当 {matched.length}件（未登録 {unownedCount}件）
            </Text>
            {groupedAreas.map((areaName) => {
              const areaItems = matched.filter((i) => i.areaName === areaName);
              const products = [...new Set(areaItems.map((i) => i.itemDetail))];
              const isCandidate = areaItems.every((i) => i.confidence === "area");
              const selectable = areaItems.filter((i) => !ownedNames.has(i.itemName));
              const allChecked = selectable.length > 0 && selectable.every((i) => checked.has(i.itemName));
              const isCollapsed = collapsed.has(areaName);

              return (
                <View key={areaName} style={styles.areaGroup}>
                  <View style={styles.areaHeader}>
                    <TouchableOpacity style={styles.areaHeaderLeft} onPress={() => toggleCollapsed(areaName)}>
                      <Text style={styles.areaCaret}>{isCollapsed ? "▶" : "▼"}</Text>
                      <Text style={styles.areaName}>{areaName}</Text>
                      {isCandidate && (
                        <View style={styles.candidateBadge}>
                          <Text style={styles.candidateBadgeText}>地域のみ一致</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.checkbox, allChecked && styles.checkboxChecked]}
                      onPress={() => toggleMany(areaItems)}
                      disabled={selectable.length === 0}
                    >
                      {allChecked && <Text style={styles.checkboxMark}>✓</Text>}
                    </TouchableOpacity>
                  </View>

                  {!isCollapsed &&
                    products.map((detail) => {
                      const productItems = areaItems.filter((i) => i.itemDetail === detail);
                      return (
                        <View key={detail}>
                          <TouchableOpacity onPress={() => toggleMany(productItems)}>
                            <Text style={styles.productLabel}>{detail || "（商品名なし）"}</Text>
                          </TouchableOpacity>
                          {productItems.map((item) => {
                            const alreadyOwned = ownedNames.has(item.itemName);
                            return (
                              <TouchableOpacity
                                key={item.itemName}
                                style={[styles.itemRow, alreadyOwned && styles.itemRowDisabled]}
                                onPress={() => !alreadyOwned && toggleItem(item.itemName)}
                                disabled={alreadyOwned}
                              >
                                <View style={[styles.checkbox, checked.has(item.itemName) && styles.checkboxChecked]}>
                                  {checked.has(item.itemName) && <Text style={styles.checkboxMark}>✓</Text>}
                                </View>
                                {item.imageUrl && (
                                  <Image
                                    source={{ uri: `${IMAGE_BASE_URL}${item.imageUrl}` }}
                                    style={styles.itemThumb}
                                    cachePolicy="memory-disk"
                                  />
                                )}
                                <Text style={styles.itemMotif}>{item.motif}</Text>
                                {alreadyOwned && (
                                  <View style={styles.ownedBadge}>
                                    <Text style={styles.ownedBadgeText}>登録済み</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                </View>
              );
            })}
          </View>
        )}

        {!scanning && previewUri && matched.length === 0 && areas.length === 0 && !scanError && (
          <Text style={styles.emptyText}>キーホルダーが認識できませんでした</Text>
        )}
        {!scanning && previewUri && areas.length > 0 && matched.length === 0 && (
          <Text style={styles.emptyText}>認識した内容: {areas.join("、")}（DBに該当なし）</Text>
        )}
      </ScrollView>

      {matched.length > 0 && !scanning && (
        <View style={styles.footer}>
          {saveError && <Text style={styles.error}>{saveError}</Text>}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving || checked.size === 0}>
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>{checked.size}件を所持状態に反映</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: colors.gray700 },
  close: { fontSize: 22, color: colors.gray400 },
  body: { flex: 1 },
  bodyContent: { padding: 20, gap: 16 },

  pickRow: { flexDirection: "row", gap: 8 },
  pickButton: {
    flex: 1,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.pink300,
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: "center",
  },
  pickButtonText: { color: colors.pink400, fontSize: 13, textAlign: "center" },

  preview: { width: "100%", height: 192, borderRadius: 12, backgroundColor: colors.gray100 },
  clearButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clearButtonText: { color: colors.white, fontSize: 11 },

  scanningRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingVertical: 16 },
  scanningText: { fontSize: 13, color: colors.gray600 },
  error: { color: colors.red500, fontSize: 13 },
  summary: { fontSize: 12, color: colors.gray600 },
  emptyText: { fontSize: 13, color: colors.gray400, textAlign: "center", paddingVertical: 8 },

  areaGroup: { borderWidth: 1, borderColor: colors.gray100, borderRadius: 12, overflow: "hidden" },
  areaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.gray100,
  },
  areaHeaderLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  areaCaret: { fontSize: 11, color: colors.gray400 },
  areaName: { fontSize: 14, fontWeight: "600", color: colors.gray700 },
  candidateBadge: { backgroundColor: "#fffbeb", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  candidateBadgeText: { fontSize: 10, color: colors.amber400 },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.pink400, borderColor: colors.pink400 },
  checkboxMark: { color: colors.white, fontSize: 12, fontWeight: "700" },

  productLabel: { fontSize: 12, fontWeight: "500", color: colors.gray600, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  itemRowDisabled: { opacity: 0.6 },
  itemThumb: { width: 34, height: 34, borderRadius: 6, backgroundColor: colors.gray100 },
  itemMotif: { fontSize: 13, color: colors.gray600 },
  ownedBadge: { marginLeft: "auto", backgroundColor: "#f0fdf4", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  ownedBadgeText: { fontSize: 10, color: "#16a34a" },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.gray100, gap: 8 },
  saveButton: { backgroundColor: colors.pink500, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  saveButtonText: { color: colors.white, fontWeight: "600", fontSize: 14 },
});
