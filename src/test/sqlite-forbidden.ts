export default class SqliteForbidden {
  constructor() {
    throw new Error("TERRA_OFFLINE: SQLite is forbidden; mock the persistence boundary.");
  }
}
