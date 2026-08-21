import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "../theme";
import type { CollectionItem } from "../types";

type Props = {
  item: CollectionItem;
  allTags: string[];
  onSave: (tags: string[]) => Promise<void>;
  onClose: () => void;
};

export default function TagEditor({ item, allTags, onSave, onClose }: Props) {
  const [tags, setTags] = useState<string[]>(item.Tags ?? []);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestions = allTags.filter((t) => t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t));

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t].sort());
    setInput("");
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tags);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>タグを編集</Text>
          <Text style={styles.itemName} numberOfLines={2}>{item.ItemName}</Text>

          <View style={styles.tagRow}>
            {tags.length === 0 && <Text style={styles.emptyText}>タグなし</Text>}
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <Text style={styles.tagChipRemove}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="タグを追加(確定ボタンで追加)"
            placeholderTextColor={colors.gray400}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => addTag(input)}
          />

          {input.length > 0 && suggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {suggestions.slice(0, 6).map((s) => (
                <TouchableOpacity key={s} style={styles.suggestionRow} onPress={() => addTag(s)}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>保存</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { fontSize: 17, fontWeight: "700", color: colors.gray700, marginBottom: 2 },
  itemName: { fontSize: 13, color: colors.gray600, marginBottom: 16 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, minHeight: 32, marginBottom: 12 },
  emptyText: { fontSize: 13, color: colors.gray400 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.pink100,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagChipText: { fontSize: 12, color: colors.pink600, fontWeight: "500" },
  tagChipRemove: { fontSize: 14, color: colors.pink400 },
  input: {
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  suggestionBox: { borderWidth: 1, borderColor: colors.gray100, borderRadius: 8, marginTop: 4, overflow: "hidden" },
  suggestionRow: { paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  suggestionText: { fontSize: 13, color: colors.gray700 },
  saveButton: { backgroundColor: colors.pink400, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  saveButtonText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  cancelButton: { paddingVertical: 10, alignItems: "center" },
  cancelButtonText: { color: colors.gray400, fontSize: 13 },
});
