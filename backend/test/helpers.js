// Chainable Supabase query builder mock.
// Every chain method returns the same chain object; awaiting the chain resolves to `result`.
// .single() also resolves to `result` for routes that call it explicitly.
function makeChain(result = { data: [], error: null }) {
  const c = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
    single: () => Promise.resolve(result),
  };
  for (const m of ['select', 'insert', 'upsert', 'delete', 'eq', 'gte', 'order', 'limit']) {
    c[m] = () => c;
  }
  return c;
}

module.exports = { makeChain };
