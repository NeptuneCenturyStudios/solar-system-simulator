export interface PlaylistEntry {
    url: string;
    title: string;
}

export function createPlaylistEntry(filename: string): PlaylistEntry {
    const url = new URL('../assets/sounds/music/' + filename, import.meta.url).href;
    const title = filename.replace(/\.mp3$/i, '');
    return { url, title };
}

export const PLAYLIST_FILENAMES: string[] = [
    'alex-morgan-underwater-dreamscape-537486.mp3',
    'cfl_turningpages-submerged-pulse-523340.mp3',
    'delosound-space-ambient-cinematic-442834.mp3',
    'freemusicforvideo-space-ambient-495614.mp3',
    'leberch-space-440026.mp3',
    'leberch-space-ambient-509783.mp3',
    'monume-space-ambient-498030.mp3',
    'shadowsandechoes-deep-quest-dark-driving-tension-394142.mp3',
    'sigmamusicart-tension-background-music-460023.mp3',
    'slimeyfox-hydrostatic-drones-479105.mp3',
    'the_mountain-spaceship-155569.mp3',
    'universfield-haunting-music-box-289437.mp3',
    'audiocoffee-dark-space-148895.mp3',
    'nickpanekaiassets-drones-of-dread-dark-cinematic-industrial-ambient-497226.mp3',
    'vjgalaxy-melodic-techno-09-513318.mp3',
    'slimeyfox-hyperwoofer-tremormorph-541638.mp3',
    'pwlpl-progressive-techno-cinematic-tension-arc-543153.mp3',
    'absolutesound-cinematic-guitar-adventure-505779.mp3',
    'leberch-mysterious-cinematic-255712.mp3',
    'cfl_turningpages-vast-hollow-tidal-533251.mp3',
    'universfield-ambient-space-background-350710.mp3',
    'cfl_turningpages-minimalist-pulse-2-529872.mp3',
    'databend-dark-electronic-pulse-background-546935.mp3',
    'leberch-atmosphere-pulse-263075.mp3',
    'joyinsound-drone-perspectives-399304.mp3',
    'fabienroch-nebulous-173888.mp3',
    'kaazoom-tension-20224.mp3',
    'romansenykmusic-drone-cinematic-mysterious-144210.mp3',
    'sergepavkinmusic-endless-space-149636.mp3',
    'sergepavkinmusic-outer-space-188045.mp3',
    'universfield-starlight-harmonies-185900.mp3',
    'neptunecentury-lost-in-the-cosmos.mp3',
    'alexrockbeat-drone-591036.mp3',
    'atlasaudio-atmosphere-590805.mp3',
    'atlasaudio-true-crime-590803.mp3',
    'danyvin-trip-hop-591699.mp3',
    'databend-dark-suspense-trip-hop-background-500760.mp3',
    'databend-neon-nebula-ambient-electronic-background-500763.mp3',
    'databend-peaceful-ambient-for-studying-589449.mp3',
    'leberch-riser-590947.mp3',
    'strawberry_candy-chill-minimal-warm-atmosphere-591183.mp3',
];
