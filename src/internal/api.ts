import {GraphQLClient} from 'graphql-request';
import {graphql} from '../gql/index.js';
import {
  UpsertBucketMutation,
  UpsertBucketMutationVariables,
  ViewerQuery,
  RunUploadUrlsQuery,
  RunUploadUrlsQueryVariables,
  TypedDocumentString,
} from '../gql/graphql.js';
import {requestWithRetry} from '../sdk/lib/retry.js';

const UpsertBucketMutationDocument = graphql(/* GraphQL */ `
  mutation UpsertBucket(
    $id: String
    $name: String
    $project: String
    $entity: String
    $groupName: String
    $description: String
    $displayName: String
    $notes: String
    $commit: String
    $config: JSONString
    $host: String
    $debug: Boolean
    $program: String
    $repo: String
    $jobType: String
    $state: String
    $sweep: String
    $tags: [String!]
    $summaryMetrics: JSONString
  ) {
    upsertBucket(
      input: {
        id: $id
        name: $name
        groupName: $groupName
        modelName: $project
        entityName: $entity
        description: $description
        displayName: $displayName
        notes: $notes
        config: $config
        commit: $commit
        host: $host
        debug: $debug
        jobProgram: $program
        jobRepo: $repo
        jobType: $jobType
        state: $state
        sweep: $sweep
        tags: $tags
        summaryMetrics: $summaryMetrics
      }
    ) {
      bucket {
        id
        name
        displayName
        description
        config
        sweepName
        project {
          id
          name
          entity {
            id
            name
          }
        }
      }
      inserted
    }
  }
`);

const ViewerQueryDocument = graphql(/* GraphQL */ `
  query Viewer {
    viewer {
      id
      entity
      flags
      teams {
        edges {
          node {
            name
          }
        }
      }
    }
  }
`);

const RunUploadUrlQueryDocument = graphql(/* GraphQL */ `
  query RunUploadUrls(
    $name: String!
    $files: [String]!
    $entity: String
    $run: String!
    $description: String
  ) {
    model(name: $name, entityName: $entity) {
      bucket(name: $run, desc: $description) {
        id
        files(names: $files) {
          uploadHeaders
          edges {
            node {
              name
              url(upload: true)
              updatedAt
            }
          }
        }
      }
    }
  }
`);

export class InternalApi {
  client: GraphQLClient;
  defaultEntity: string;

  constructor(host: string, key?: string, entity?: string) {
    this.client = this.createClient(host, key);
    this.defaultEntity = entity || '';
  }

  createClient(host: string, key?: string) {
    return new GraphQLClient(`${host}/graphql`, {
      headers: {
        authorization: key
          ? `Basic ${Buffer.from('api:' + key).toString('base64')}`
          : '',
      },
      // only throw if we get a non-200 response
      errorPolicy: 'ignore',
    });
  }

  // TODO: put this in a better place.
  async ensureDefaultEntity() {
    if (this.defaultEntity === '') {
      const viewer = await this.viewer();
      if (viewer.viewer) {
        this.defaultEntity = viewer.viewer.entity || '';
      }
    }
    if (this.defaultEntity === '') {
      throw new Error('Unable to determine default entity');
    }
  }

  upsertRun(
    vars: UpsertBucketMutationVariables
  ): Promise<UpsertBucketMutation> {
    return this.execute(UpsertBucketMutationDocument, vars);
  }

  viewer(): Promise<ViewerQuery> {
    return this.execute(ViewerQueryDocument, {});
  }

  uploadUrls(vars: RunUploadUrlsQueryVariables): Promise<RunUploadUrlsQuery> {
    return this.execute(RunUploadUrlQueryDocument, vars);
  }

  execute(query: TypedDocumentString<any, any>, vars: any): Promise<any> {
    // TODO: don't love this, but works for now
    if (vars.entity == '') {
      vars.entity = this.defaultEntity;
    }
    return requestWithRetry(this.client.request(query.toString(), vars), {
      maxAttempts: 50,
      maxDelayMs: 30000,
    });
  }
}
