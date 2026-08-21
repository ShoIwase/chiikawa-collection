import { StyleSheet, Text, TouchableOpacity } from "react-native";

type Props = { count: number; onPress: () => void };

export default function AlertBanner({ count, onPress }: Props) {
  if (count === 0) return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress}>
      <Text style={styles.text}>⚠️ 未確認の新着アイテムが {count} 件あります。タップして確認する</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#fef9c3",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  text: { color: "#854d0e", fontSize: 13, fontWeight: "500" },
});
