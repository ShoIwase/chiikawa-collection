import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCollectionItems, UnauthorizedError } from "../api";
import { useSession } from "../hooks/useSession";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { CHARACTERS, OTHER_AREA_LABEL, PREFECTURES, type CollectionItem } from "../types";

function pct(owned: number, total: number) {
  if (total === 0) return 0;
  return Math.round((owned / total) * 100);
}

function ProgressBar({ owned, total }: { owned: number; total: number }) {
  const p = pct(owned, total);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${p}%` }]} />
      </View>
      <Text style={styles.progressLabel}>{owned}/{total} ({p}%)</Text>
    </View>
  );
}

export default function StatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Stats">>();
  const { idToken, logout } = useSession();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken) return;
    getCollectionItems(idToken)
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

  const totalOwned = items.filter((i) => i.Owned).length;
  const total = items.length;

  const charStats = useMemo(
    () => CHARACTERS.map((c) => {
      const sub = items.filter((i) => i.Motif === c);
      return { char: c, owned: sub.filter((i) => i.Owned).length, total: sub.length };
    }),
    [items]
  );

  const prefStats = useMemo(() => {
    const map = new Map<string, { owned: number; total: number }>();
    items.forEach((i) => {
      const key = i.Prefecture || OTHER_AREA_LABEL;
      const s = map.get(key) ?? { owned: 0, total: 0 };
      s.total++;
      if (i.Owned) s.owned++;
      map.set(key, s);
    });
    const ordered: { pref: string; owned: number; total: number }[] = [];
    PREFECTURES.forEach((p) => {
      const s = map.get(p);
      if (s) ordered.push({ pref: p, ...s });
    });
    const other = map.get(OTHER_AREA_LABEL);
    if (other) ordered.push({ pref: OTHER_AREA_LABEL, ...other });
    return ordered;
  }, [items]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>集計</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>コレクションに戻る</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.pink400} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>全体</Text>
            <View style={styles.totalsRow}>
              <Text style={styles.totalOwned}>{totalOwned}</Text>
              <Text style={styles.totalSlash}>/ {total} 個</Text>
              <Text style={styles.totalPct}>{pct(totalOwned, total)}%</Text>
            </View>
            <ProgressBar owned={totalOwned} total={total} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>キャラ別</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {charStats.map(({ char, owned, total: t }) => (
                <View key={char}>
                  <Text style={styles.rowLabel}>{char}</Text>
                  <ProgressBar owned={owned} total={t} />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>エリア別</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {prefStats.map(({ pref, owned, total: t }) => (
                <View key={pref}>
                  <Text style={styles.rowLabel}>{pref}</Text>
                  <ProgressBar owned={owned} total={t} />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  title: { fontSize: 19, fontWeight: "700", color: colors.pink500 },
  back: { fontSize: 12, color: colors.gray400, textDecorationLine: "underline" },
  error: { color: colors.red500, paddingHorizontal: 16, fontSize: 13 },

  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.gray100, padding: 18 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: colors.gray400, textTransform: "uppercase" },
  totalsRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 8, marginBottom: 8 },
  totalOwned: { fontSize: 34, fontWeight: "700", color: colors.pink500 },
  totalSlash: { fontSize: 15, color: colors.gray400 },
  totalPct: { marginLeft: "auto", fontSize: 20, fontWeight: "700", color: colors.gray700 },

  rowLabel: { fontSize: 13, color: colors.gray700, marginBottom: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: colors.gray100, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.pink400, borderRadius: 999 },
  progressLabel: { fontSize: 11, color: colors.gray600, width: 90, textAlign: "right" },
});
