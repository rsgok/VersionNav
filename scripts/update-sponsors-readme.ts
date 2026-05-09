import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type SponsorEntity = {
  avatarUrl: string;
  login: string;
  url: string;
};

type SponsorshipNode = {
  privacyLevel: string;
  sponsorEntity: SponsorEntity | null;
};

type SponsorshipEdge = {
  cursor: string;
  node: SponsorshipNode;
};

type SponsorshipResponse = {
  data?: {
    user?: {
      sponsorshipsAsMaintainer: {
        edges: SponsorshipEdge[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
};

const sponsorAccount = process.env.SPONSOR_ACCOUNT ?? process.env.GITHUB_REPOSITORY_OWNER ?? "rsgok";
const token = process.env.GITHUB_TOKEN;
const readmePath = resolve(process.cwd(), "README.md");
const startMarker = "<!-- sponsors-start -->";
const endMarker = "<!-- sponsors-end -->";

if (!token) {
  throw new Error("GITHUB_TOKEN is required to update README sponsors.");
}

async function fetchSponsors(after: string | null = null): Promise<SponsorEntity[]> {
  const query = `
    query Sponsors($login: String!, $after: String) {
      user(login: $login) {
        sponsorshipsAsMaintainer(first: 100, after: $after, activeOnly: true) {
          edges {
            cursor
            node {
              privacyLevel
              sponsorEntity {
                ... on User {
                  login
                  url
                  avatarUrl(size: 96)
                }
                ... on Organization {
                  login
                  url
                  avatarUrl(size: 96)
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "VersionNav sponsors updater"
    },
    body: JSON.stringify({
      query,
      variables: { login: sponsorAccount, after }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as SponsorshipResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const connection = payload.data?.user?.sponsorshipsAsMaintainer;
  if (!connection) {
    throw new Error(`GitHub user not found or sponsors unavailable: ${sponsorAccount}`);
  }

  const sponsors = connection.edges
    .filter((edge) => edge.node.privacyLevel === "PUBLIC")
    .map((edge) => edge.node.sponsorEntity)
    .filter((entity): entity is SponsorEntity => entity !== null);

  if (!connection.pageInfo.hasNextPage) {
    return sponsors;
  }

  return sponsors.concat(await fetchSponsors(connection.pageInfo.endCursor));
}

function renderSponsors(sponsors: SponsorEntity[]): string {
  if (sponsors.length === 0) {
    return `No public sponsors yet. [Become a sponsor](https://github.com/sponsors/${sponsorAccount}).`;
  }

  return sponsors
    .map(
      (sponsor) =>
        `<a href="${sponsor.url}" title="@${sponsor.login}"><img src="${sponsor.avatarUrl}" width="48" height="48" alt="@${sponsor.login}" /></a>`
    )
    .join("\n");
}

function updateReadme(content: string, sponsorsMarkdown: string): string {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);

  if (start === -1 || end === -1 || start > end) {
    throw new Error(`README.md must contain ${startMarker} and ${endMarker}.`);
  }

  return `${content.slice(0, start + startMarker.length)}\n${sponsorsMarkdown}\n${content.slice(end)}`;
}

const sponsors = await fetchSponsors();
const readme = readFileSync(readmePath, "utf8");
writeFileSync(readmePath, updateReadme(readme, renderSponsors(sponsors)));

console.log(`Updated README with ${sponsors.length} public sponsor(s).`);
