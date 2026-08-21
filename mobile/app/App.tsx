import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "./src/hooks/useSession";
import type { RootStackParamList } from "./src/navigation";
import LoginScreen from "./src/screens/LoginScreen";
import CollectionScreen from "./src/screens/CollectionScreen";
import ScanScreen from "./src/screens/ScanScreen";
import StatsScreen from "./src/screens/StatsScreen";
import VerifyScreen from "./src/screens/VerifyScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { isLoggedIn, isBootstrapping } = useSession();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <>
          <Stack.Screen name="Collection" component={CollectionScreen} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ presentation: "modal" }} />
          <Stack.Screen name="Stats" component={StatsScreen} />
          <Stack.Screen name="Verify" component={VerifyScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
