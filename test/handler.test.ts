import {
  handleRequest,
  validGoogleTakeoutUrl,
  validTestServerURL,
} from '../src/handler'
import {
  azBlobSASUrlToProxyPathname, azBlobSASUrlToTransloadProxyPathname,
  proxyPathnameToAzBlobSASUrl,
} from '../src/azb'

// URL is too long, just move it to another file.
import {
  real_takeout_url,
  real_azb_url,
  file_test_small_url,
  file_test_large_url,
  small_test_string_encoded_url
} from './real_url'

describe('handler utilities', () => {
  test('has functions that can determine if a URL is from takeout, test server, or not', async () => {
    const bad_url = new URL('http://iscaliforniaonfire.com/')
    expect(validGoogleTakeoutUrl(bad_url)).toBeFalsy()
    expect(validGoogleTakeoutUrl(real_takeout_url)).toBeTruthy()
    expect(validTestServerURL(file_test_small_url)).toBeTruthy()
  })
})

describe('handler', () => {
  test('redirect visiting the "front page" to GitHub', async () => {
    const result = await handleRequest(
      new Request(`https://example.com/`, {method: 'GET'}),
    )
    expect(result.status).toEqual(302)
    expect(result.headers.get('Location')).toContain('github.com')
  })
})

describe('transload handler', () => {

  test('can facilitate transload of a large file in a single block', async () => {
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    const file_source_url = file_test_large_url

    const requestUrl = new URL(
      `https://example.com/t-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    requestUrl.pathname = requestUrl.pathname.replace(
      'test.dat',
      't-azb-small.dat',
    )

    const request = new Request(requestUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-gtr-copy-source': file_source_url.toString(),
      },
    })

    const result = await handleRequest(request)
    const ok = await result.text()
    expect(ok).toEqual('')

    expect(result.status).toEqual(201)
  }, 60000)


  test('can facilitate transload of a large file with multiple blocks', async () => {
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    const file_source_url = file_test_large_url

    const base_request_url = new URL(
      `https://example.com/t-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      't-azb-large.dat',
    )

    // Transfer size is 100MB Chunk size
    const transfer_size = 1024 * 1024 * 100

    // First block

    // Construct the first block request url
    const first_block_request_url = new URL(base_request_url)
    first_block_request_url.searchParams.append('comp', 'block')
    // Generate a block id, must be base64 encoded
    const first_block_id = Buffer.from('1').toString('base64')
    first_block_request_url.searchParams.append('blockid', first_block_id)

    const first_block_request = new Request(first_block_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-gtr-copy-source': file_source_url.toString(),
        'x-gtr-copy-source-range': `bytes=0-${transfer_size - 1}`,
      }
    })

    const first_block_result = await handleRequest(first_block_request)
    const first_block_ok = await first_block_result.text()
    expect(first_block_ok).toEqual('')
    expect(first_block_result.status).toEqual(201)

    // Second block

    // Construct the second block request url
    const second_block_request_url = new URL(base_request_url)
    second_block_request_url.searchParams.append('comp', 'block')
    // Generate a block id, must be base64 encoded
    const second_block_id = Buffer.from('2').toString('base64')
    second_block_request_url.searchParams.append('blockid', second_block_id)

    const second_block_request = new Request(second_block_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-gtr-copy-source': file_source_url.toString(),
        'x-gtr-copy-source-range': `bytes=${transfer_size}-${transfer_size * 2 - 1}`,
      }
    })

    const second_block_result = await handleRequest(second_block_request)
    const second_block_ok = await second_block_result.text()
    expect(second_block_ok).toEqual('')
    expect(second_block_result.status).toEqual(201)

    // Commit the blocks

    // Construct the commit request url to directly contact Azure from the request url
    // Get the container from the base request url

    // Get container from AZ_STORAGE_TEST_URL_SEGMENT
    const test_url_split = AZ_STORAGE_TEST_URL_SEGMENT.split('/')
    const container = test_url_split[0]
    // Get rest of URL from AZ_STORAGE_TEST_URL_SEGMENT
    const rest_of_url = test_url_split.slice(1).join('/')

    const commit_request_url = new URL(`https://${container}.blob.core.windows.net/${rest_of_url}`)
    commit_request_url.searchParams.append('comp', 'blocklist')
    // Change pathname of request URL
    commit_request_url.pathname = commit_request_url.pathname.replace(
      'test.dat',
      't-azb-large.dat',
    )

    const commit_request = new Request(commit_request_url, {
      method: 'PUT',
      headers: {},
      body: `<?xml version="1.0" encoding="utf-8"?>
        <BlockList><Latest>${first_block_id}</Latest><Latest>${second_block_id}</Latest></BlockList>
      `
    })

    // Send request with fetch
    const commit_result = await fetch(commit_request)
    const commit_ok = await commit_result.text()
    expect(commit_ok).toEqual('')
    expect(commit_result.status).toEqual(201)

  }, 120000)
})

describe('azure proxy handler', () => {

  test('handles proxying to azure', async () => {
    const result = await handleRequest(
      new Request(
        `https://example.com/p-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D`,
        {method: 'GET'},
      ),
    )

    // This should be a rejection, as if we visited the URL with a GET directly to Azure. The signature has long since expired.
    expect(result.status).toEqual(403)
  })

  test('handles proxying a transload request to azure with azure transloading from cloudflare itself', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    const file_source_url = file_test_small_url

    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-direct.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      }
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

  test('handles proxying a transload request to azure with azure transloading from cloudflare via the proxy', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    // Construct the file_source_url that is proxied to the proxy
    // "https://gtr-proxy.677472.xyz/p/" is prepended to the file_test_small_url with file_test_small_url's scheme removed.
    const file_source_url = new URL(
      `https://gtr-proxy.677472.xyz/p/${file_test_large_url.toString().replace(
        'https://',
        ''
      )}`,
    )


    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-via-proxy.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      }
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

  test('handles proxying a transload request with encoded URL to azure with azure transloading from cloudflare via the proxy', async () => {
    // Not exactly a clean unit test since it depends on a properly deployed proxy already, but it'll do.
    const AZ_STORAGE_TEST_URL_SEGMENT = process.env.AZ_STORAGE_TEST_URL_SEGMENT
    if (!AZ_STORAGE_TEST_URL_SEGMENT) {
      throw new Error(
        'AZ_STORAGE_TEST_URL_SEGMENT environment variable is not set',
      )
    }

    // Construct the file_source_url that is proxied to the proxy
    // "https://gtr-proxy.677472.xyz/p/" is prepended to the file_test_small_url with file_test_small_url's scheme removed.
    const file_source_url = new URL(
      `https://gtr-proxy.677472.xyz/p/${small_test_string_encoded_url.toString().replace(
        'https://',
        ''
      )}`,
    )


    const base_request_url = new URL(
      `https://example.com/p-azb/${AZ_STORAGE_TEST_URL_SEGMENT}`,
    )
    // Change filename of request URL
    base_request_url.pathname = base_request_url.pathname.replace(
      'test.dat',
      'p-azb-transload-encoded-url-via-proxy.dat',
    )

    // Do a single block upload
    const single_block_request = new Request(base_request_url, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-copy-source': file_source_url.toString(),
      }
    })

    const single_block_result = await handleRequest(single_block_request)
    const single_block_ok = await single_block_result.text()
    expect(single_block_ok).toEqual('')
  })

})

describe('takeout proxy handler', () => {
 test('handles proxying to takeout test server on non-existent link', async () => {
   const result = await handleRequest(
     new Request(
       `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red/blue.txt`,
       {method: 'GET'},
     ),
   )

   expect(result.status).toEqual(404)
   expect(await result.text()).toEqual('This path actually doesn\'t exist.')
 })

  test('handles proxying to takeout test server on existent link with escaping', async () => {
    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%2Fblue.txt`,
        {method: 'GET'},
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })

  test('handles proxying to takeout test server on existent link with extra escaping', async () => {
    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%252Fblue.txt`,
        {method: 'GET'},
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })

  test('handles proxying to takeout test server on existent link with extra escaping and dummy appended', async () => {
    const result = await handleRequest(
      new Request(
        `https://example.com/p/put-block-from-url-esc-issue-demo-server-3vngqvvpoq-uc.a.run.app/red%252Fblue.txt/dummy.bin`,
        {method: 'GET'},
      ),
    )

    expect(result.status).toEqual(200)
    expect(await result.text()).toEqual('This path exists!')
  })
})

describe('url-parser', () => {
  test('can transload proxify the azure blob SAS URL', async () => {
    const path = azBlobSASUrlToTransloadProxyPathname(
      real_azb_url,
      'https://example.com',
    )
    expect(path).toEqual(
      new URL(
        '/t-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToAzBlobSASUrl(path)
    expect(url).toEqual(real_azb_url)
  })


  test('can proxify the azure blob SAS URL', async () => {
    const path = azBlobSASUrlToProxyPathname(
      real_azb_url,
      'https://example.com',
    )
    expect(path).toEqual(
      new URL(
        '/p-azb/urlcopytest/some-container/some_file.dat?sp=racwd&st=2022-04-03T02%3A09%3A13Z&se=2022-04-03T02%3A20%3A13Z&spr=https&sv=2020-08-04&sr=c&sig=u72iEGi5SLkPg8B7QVI5HXfHSnr3MOse%2FzWzhaYdbbU%3D',
        'https://example.com',
      ),
    )
    const url = proxyPathnameToAzBlobSASUrl(path)
    expect(url).toEqual(real_azb_url)
  })
})
