import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { colors } from '@/theme';

/** Bottom navigation per docs/UX_SPEC.md §1. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.charcoal,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.ivory,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="talk"
        options={{
          title: 'Talk',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="decisions"
        options={{
          title: 'Decisions',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-done-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="company"
        options={{
          title: 'Company',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
