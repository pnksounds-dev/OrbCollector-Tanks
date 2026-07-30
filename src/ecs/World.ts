/** Lightweight Entity-Component-System world.
 *
 * Entities are integer IDs. Components are stored in per-name `Map<EntityId, T>`.
 * `query(...names)` returns entities having ALL given components; the result is
 * cached and invalidated lazily on any add/remove/destroy (via `queryDirty`).
 * Call `flush()` after batch entity changes inside a system so the next query
 * sees the new state — mirrors the undergrowth ECWorld pattern.
 */

export type EntityId = number;

type ComponentStore = Map<EntityId, unknown>;

export class ECWorld {
  private nextId = 1;
  private stores = new Map<string, ComponentStore>();
  private alive = new Set<EntityId>();
  private queryCache = new Map<string, EntityId[]>();
  private queryDirty = true;

  createEntity(): EntityId {
    const id = this.nextId++;
    this.alive.add(id);
    this.queryDirty = true;
    return id;
  }

  destroyEntity(id: EntityId): void {
    if (!this.alive.has(id)) return;
    this.alive.delete(id);
    for (const store of this.stores.values()) {
      store.delete(id);
    }
    this.queryDirty = true;
  }

  isAlive(id: EntityId): boolean {
    return this.alive.has(id);
  }

  addComponent<T>(id: EntityId, name: string, data: T): void {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    store.set(id, data);
    this.queryDirty = true;
  }

  getComponent<T>(id: EntityId, name: string): T | undefined {
    const store = this.stores.get(name);
    if (!store) return undefined;
    return store.get(id) as T | undefined;
  }

  hasComponent(id: EntityId, name: string): boolean {
    const store = this.stores.get(name);
    return store ? store.has(id) : false;
  }

  removeComponent(id: EntityId, name: string): void {
    const store = this.stores.get(name);
    if (store) {
      store.delete(id);
      this.queryDirty = true;
    }
  }

  /** Returns entities having ALL given component names. Result is cached. */
  query(...names: string[]): EntityId[] {
    const key = names.slice().sort().join(",");
    if (!this.queryDirty) {
      const cached = this.queryCache.get(key);
      if (cached) return cached;
    }
    const result: EntityId[] = [];
    if (names.length === 0) {
      for (const id of this.alive) result.push(id);
    } else {
      // Start from the smallest store
      const stores = names
        .map((n) => this.stores.get(n))
        .filter((s): s is ComponentStore => s !== undefined);
      if (stores.length !== names.length) {
        // A requested component has no store at all → no matches
        this.queryCache.set(key, result);
        return result;
      }
      stores.sort((a, b) => a.size - b.size);
      const smallest = stores[0];
      for (const id of smallest.keys()) {
        if (!this.alive.has(id)) continue;
        let hasAll = true;
        for (let i = 1; i < stores.length; i++) {
          if (!stores[i].has(id)) {
            hasAll = false;
            break;
          }
        }
        if (hasAll) result.push(id);
      }
    }
    this.queryCache.set(key, result);
    return result;
  }

  /** Invalidate the query cache. Call after batch entity changes in a system. */
  flush(): void {
    if (this.queryDirty) {
      this.queryCache.clear();
      this.queryDirty = false;
    }
  }

  get entityCount(): number {
    return this.alive.size;
  }
}
