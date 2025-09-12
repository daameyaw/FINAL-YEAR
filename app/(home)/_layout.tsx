import { Stack } from "expo-router";
import React from "react";

export default function HomeLayout() {
  return (
    <Stack initialRouteName="index">
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="main"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
