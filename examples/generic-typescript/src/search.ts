export interface DocumentRepository {
  search(query: string): Promise<readonly string[]>;
}

export class SearchService {
  constructor(private readonly repository: DocumentRepository) {}

  search(query: string): Promise<readonly string[]> {
    return this.repository.search(query.trim());
  }
}
