export const demoCredentials = {
  bobsTinyTreasures: {
    supervisor: { name: 'Bob (Owner)', username: 'Bob (Owner)', password: 'btt01' },
    pickers: [
      { name: 'Sprinkle', pin: '7777' },
      { name: 'Glimmer', pin: '8888' },
      { name: 'Twinkle', pin: '1111' },
      { name: 'Dazzle',  pin: '2222' },
      { name: 'Pebble',  pin: '3333' },
      { name: 'Fizz',    pin: '4444' },
      { name: 'Cosmo',   pin: '5555' },
      { name: 'Blaze',   pin: '6666' },
    ],
  },
} as const;

export type DemoCredentials = typeof demoCredentials;
