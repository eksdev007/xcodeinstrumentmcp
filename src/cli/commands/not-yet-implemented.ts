export function notYetImplemented(commandName: string): (..._args: unknown[]) => never {
  return () => {
    throw new Error(`The "${commandName}" workflow is not implemented yet.`);
  };
}
