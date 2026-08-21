import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSession } from "../hooks/useSession";
import { colors } from "../theme";

export default function LoginScreen() {
  const { login } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>🐾 ご当地ちいかわコレクション</Text>
        <Text style={styles.label}>パスワード</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          autoFocus
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>ログイン</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16, backgroundColor: colors.white },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 32,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 22, fontWeight: "700", color: colors.pink500, textAlign: "center", marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "500", color: colors.gray600, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    fontSize: 15,
  },
  error: { color: colors.red500, fontSize: 13, marginBottom: 12 },
  button: { backgroundColor: colors.pink400, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: colors.white, fontWeight: "600", fontSize: 15 },
});
