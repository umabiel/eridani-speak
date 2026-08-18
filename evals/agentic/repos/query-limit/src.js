const users = new Map([
  [1, 'alice'],
  [2, 'bob'],
  [3, 'carol'],
]);
let queries = 0;

export function getUser(id) {
  queries += 1;
  return users.get(id);
}

export function getUsers(ids) {
  // BUG: one query per id — latency grows linearly with list size.
  return ids.map((id) => getUser(id));
}

export function queryCount() {
  return queries;
}
