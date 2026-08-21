import { Image } from "expo-image";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

export default function ImageLightbox({ src, alt, onClose }: Props) {
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.imageWrap}>
          <Image source={{ uri: src }} style={styles.image} contentFit="contain" cachePolicy="memory-disk" />
        </View>
        <Text style={styles.caption}>{alt}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  closeButton: { position: "absolute", top: 48, right: 20 },
  closeText: { color: colors.white, fontSize: 28 },
  imageWrap: { width: "100%", aspectRatio: 1 },
  image: { width: "100%", height: "100%" },
  caption: { color: colors.white, fontSize: 13, textAlign: "center", marginTop: 16, paddingHorizontal: 16 },
});
