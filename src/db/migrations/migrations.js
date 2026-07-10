// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo
// NOTA: los .sql se inlinean aquí vía babel-plugin-inline-import; Metro NO invalida su
// caché cuando cambia solo un .sql. Si editás un .sql ya generado, corré `expo start -c`
// (o cambiá este archivo) para que el bundle tome el SQL nuevo.

import journal from './meta/_journal.json';
import m0000 from './0000_hesitant_malcolm_colcord.sql';
import m0001 from './0001_worthless_shaman.sql';
import m0002 from './0002_regular_manta.sql';
import m0003 from './0003_greedy_inhumans.sql';
import m0004 from './0004_free_wallflower.sql';
import m0005 from './0005_organic_luminals.sql';
import m0006 from './0006_amusing_infant_terrible.sql';
import m0007 from './0007_wonderful_franklin_storm.sql';
import m0008 from './0008_absent_adam_warlock.sql';
import m0009 from './0009_nappy_eternals.sql';
import m0010 from './0010_certain_radioactive_man.sql';
import m0011 from './0011_mature_quasimodo.sql';
import m0012 from './0012_huge_ezekiel_stane.sql';
import m0013 from './0013_gray_blue_blade.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013
    }
  }
  