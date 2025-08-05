<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<div class="container mx-auto p-4">
  <h1 class="text-2xl font-bold mb-4">Commands</h1>

  <div class="mb-8">
    <h2 class="text-xl font-semibold mb-2">Add New Command</h2>
    <form method="POST" action="?/create" class="flex gap-2 items-center">
      <input type="text" name="name" placeholder="Name" class="border rounded px-2 py-1" />
      <input type="text" name="command" placeholder="Command" class="border rounded px-2 py-1 flex-grow" />
      <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Add</button>
    </form>
  </div>

  <div>
    <h2 class="text-xl font-semibold mb-2">Existing Commands</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.commands as command}
        <div class="border rounded p-4">
          <h3 class="font-bold text-lg">{command.name}</h3>
          <p class="font-mono bg-gray-100 p-2 rounded mt-2">{command.command}</p>
        </div>
      {/each}
    </div>
  </div>
</div>
