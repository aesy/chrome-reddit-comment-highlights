
export interface HttpRequestOptions {
    method?: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
    params?: { [key: string]: string };
    headers?: { [key: string]: string };
    data?: any;
}

export function makeRequest<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        if (options.headers) {
            for (const [ key, value ] of Object.entries(options.headers)) {
                xhr.setRequestHeader(key, value);
            }
        }

        if (options.params) {
            const params = Object.entries(options.params)
                .map(([ key, value ]) => {
                    return `${ encodeURIComponent(key) }=${ encodeURI(value) }`;
                })
                .join("&");

            url += `?${ params }`;
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(xhr.statusText);
            }
        };
        xhr.onerror = () => reject(xhr.statusText);

        xhr.open(options.method || "GET", url);
        xhr.send(options.data);
    });
}
