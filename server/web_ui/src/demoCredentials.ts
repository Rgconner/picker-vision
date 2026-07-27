export const demoCredentials = {
  bobsTinyTreasures: {
    supervisor: { name: 'Bob (Owner)', username: 'Bob (Owner)', password: 'btt01' },
    pickers: [
      { name: 'Sprinkle', pin: '7777' },
      { name: 'Glimmer', pin: '8888' },
    ],
  },
} as const;

export type DemoCredentials = typeof demoCredentials;
