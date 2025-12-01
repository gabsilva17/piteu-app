import { createRoom, joinRoom } from "./actions";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-sans text-foreground">
      <main className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Piteu Rooms
          </h1>
          <p className="mt-2 text-muted-foreground">
            Create a room or join an existing one to hang out.
          </p>
        </div>

        {error === "room_not_found" && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Room not found. Please check the code and try again.
          </div>
        )}

        <div className="flex w-full flex-col gap-4">
          <form action={createRoom}>
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Create New Room
            </button>
          </form>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border"></div>
            <span className="mx-4 flex-shrink-0 text-xs text-muted-foreground">OR</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <form action={joinRoom} className="flex flex-col gap-3">
            <input
              name="code"
              type="text"
              placeholder="Enter Room Code"
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Join Room
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
