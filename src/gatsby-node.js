import path from "path"
import { simpleSitemapAndIndex } from "sitemap"
import { pluginOptionsSchema } from "./options-validation"
import { prefixPath, pageFilter, REPORTER_PREFIX } from "./internals"

exports.pluginOptionsSchema = pluginOptionsSchema

exports.onPostBuild = async (
  { graphql, reporter, basePath, pathPrefix },
  {
    output,
    entryLimit,
    query,
    excludes,
    resolveSiteUrl,
    resolvePagePath,
    resolvePages,
    filterPages,
    serialize,
    // WST START: This is an option created by Workast.
    ignoreAssetPrefix,
    // WST END
  }
) => {
  const { data: queryRecords, errors } = await graphql(query)

  // resolvePages and resolveSiteUrl are allowed to be sync or async. The Promise.resolve handles each possibility
  const siteUrl = await Promise.resolve(resolveSiteUrl(queryRecords)).catch(
    err => reporter.panic(`${REPORTER_PREFIX} Error resolving Site URL`, err)
  )

  if (errors) {
    reporter.panic(
      `Error executing the GraphQL query inside gatsby-plugin-sitemap:\n`,
      errors
    )
  }

  const allPages = await Promise.resolve(resolvePages(queryRecords)).catch(
    err => reporter.panic(`${REPORTER_PREFIX} Error resolving Pages`, err)
  )

  if (!Array.isArray(allPages)) {
    reporter.panic(
      `${REPORTER_PREFIX} The \`resolvePages\` function did not return an array.`
    )
  }

  reporter.verbose(
    `${REPORTER_PREFIX} Filtering ${allPages.length} pages based on ${excludes.length} excludes`
  )

  const { filteredPages, messages } = pageFilter(
    {
      allPages,
      filterPages,
      excludes,
    },
    { reporter }
  )

  messages.forEach(message => reporter.verbose(message))

  reporter.verbose(
    `${REPORTER_PREFIX} ${filteredPages.length} pages remain after filtering`
  )

  const serializedPages = []

  for (const page of filteredPages) {
    try {
      const { url, ...rest } = await Promise.resolve(
        serialize(page, { resolvePagePath })
      )
      serializedPages.push({
        url: prefixPath({ url, siteUrl, pathPrefix: basePath }),
        ...rest,
      })
    } catch (err) {
      reporter.panic(`${REPORTER_PREFIX} Error serializing pages`, err)
    }
  }

  const sitemapWritePath = path.join(`public`, output)
  // WST START: The original line is commented.
  // const sitemapPublicPath = path.posix.join(pathPrefix, output)
  const sitemapPublicPath = ignoreAssetPrefix
    ? output
    : path.posix.join(pathPrefix, output);
  // WST END

  return simpleSitemapAndIndex({
    hostname: siteUrl,
    publicBasePath: sitemapPublicPath,
    destinationDir: sitemapWritePath,
    sourceData: serializedPages,
    limit: entryLimit,
    gzip: false,
  })
}
