<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const command = $derived(data.command);
</script>

<div class="container mx-auto p-4">
  <h1 class="text-2xl font-bold mb-4">{command.name}</h1>
  <p class="font-mono bg-gray-100 p-2 rounded mb-8">{command.command}</p>

  <div class="mb-8">
    <h2 class="text-xl font-semibold mb-2">Add New Argument</h2>
    <form method="POST" action="?/createArgument" class="flex gap-2 items-center">
      <input type="text" name="name" placeholder="Name" class="border rounded px-2 py-1" />
      <input type="text" name="value" placeholder="Value" class="border rounded px-2 py-1" />
      <label class="flex items-center gap-2">
        <input type="checkbox" name="isFixed" class="checkbox" />
        <span>Fixed</span>
      </label>
      <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Add Argument</button>
    </form>
  </div>

  <div>
    <h2 class="text-xl font-semibold mb-2">Arguments</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each command.args as arg}
        <div class="border rounded p-4">
          <h3 class="font-bold text-lg">{arg.name}</h3>
          <p>{arg.value}</p>
          <p class="text-sm text-gray-500">{arg.isFixed ? 'Fixed' : 'Variable'}</p>
        </div>
      {/each}
    </div>
  </div>
</div>
