import { describe, expect, it } from 'vitest';
import { definitionPattern, implementationsPattern } from './definitions';
import { jvmImportTargets, phpUseTargets } from './links';

const defines = (path: string, name: string, line: string) => definitionPattern(path, name).test(line);

describe('definitions in Java, Kotlin, PHP and C#', () => {
  it('finds a Java type and a method, not a call', () => {
    expect(defines('A.java', 'User', 'public final class User extends Base {')).toBe(true);
    expect(defines('A.java', 'UserRepo', 'public interface UserRepo extends JpaRepository<User, Long> {')).toBe(true);
    expect(defines('A.java', 'Point', 'record Point(int x, int y) {}')).toBe(true);
    expect(defines('A.java', 'findAll', '  public List<User> findAll(Pageable page) {')).toBe(true);
    expect(defines('A.java', 'save', '  private static Map<String, List<User>> save(User u) throws IOException {')).toBe(true);
    expect(defines('A.java', 'findAll', '    return repo.findAll(page);')).toBe(false);
    expect(defines('A.java', 'User', '    User u = new User();')).toBe(false);
  });

  it('finds Kotlin classes, objects, functions and properties', () => {
    expect(defines('A.kt', 'UserService', 'class UserService(private val repo: UserRepo) {')).toBe(true);
    expect(defines('A.kt', 'Config', 'object Config {')).toBe(true);
    expect(defines('A.kt', 'slug', 'fun String.slug(): String = lowercase()')).toBe(true);
    expect(defines('A.kt', 'load', '    suspend fun <T> load(id: Long): T {')).toBe(true);
    expect(defines('A.kt', 'name', '    val name: String')).toBe(true);
    expect(defines('A.kt', 'load', '    val u = load(1)')).toBe(false);
  });

  it('finds PHP classes, traits, functions and constants, and C# types and methods', () => {
    expect(defines('A.php', 'User', 'final class User extends Model')).toBe(true);
    expect(defines('A.php', 'HasRoles', 'trait HasRoles')).toBe(true);
    expect(defines('A.php', 'store', '    public function store(Request $request): RedirectResponse')).toBe(true);
    expect(defines('A.php', 'store', '        $this->store($request);')).toBe(false);
    expect(defines('A.cs', 'OrderService', 'public sealed class OrderService : IOrderService')).toBe(true);
    expect(defines('A.cs', 'PlaceAsync', '    public async Task<Order> PlaceAsync(Cart cart)')).toBe(true);
  });
});

describe('the imports of Java, Kotlin and PHP', () => {
  const files = [
    'src/main/java/com/acme/user/User.java',
    'src/main/kotlin/com/acme/user/UserService.kt',
    'src/test/java/com/acme/user/UserTest.java',
    'app/Models/User.php',
    'app/Http/Controllers/UserController.php',
    'vendor/laravel/framework/src/Illuminate/Http/Request.php',
  ];

  it('opens the file of an imported class, a static import’s too, and nothing for a library’s', () => {
    expect(jvmImportTargets('com.acme.user.User', files)).toEqual(['src/main/java/com/acme/user/User.java']);
    expect(jvmImportTargets('com.acme.user.UserService', files)).toEqual(['src/main/kotlin/com/acme/user/UserService.kt']);
    expect(jvmImportTargets('com.acme.user.User.DEFAULT', files)).toEqual(['src/main/java/com/acme/user/User.java']);
    expect(jvmImportTargets('java.util.List', files)).toEqual([]);
    expect(jvmImportTargets('com.acme.*', files)).toEqual([]);
  });

  it('opens the file of a PHP use, Laravel’s App namespace in app/ and a vendor’s class', () => {
    expect(phpUseTargets('App\\Models\\User', files)).toEqual(['app/Models/User.php']);
    expect(phpUseTargets('App\\Http\\Controllers\\UserController', files)).toEqual(['app/Http/Controllers/UserController.php']);
    expect(phpUseTargets('Illuminate\\Http\\Request', files)).toEqual(['vendor/laravel/framework/src/Illuminate/Http/Request.php']);
    expect(phpUseTargets('Other\\Thing', files)).toEqual([]);
  });
});

describe('the implementations of a type', () => {
  const impl = (line: string, name = 'UserRepo') => new RegExp(implementationsPattern(name)).test(line);

  it('finds the classes that implement or extend it, in Java, TypeScript, PHP, Kotlin and C#', () => {
    expect(impl('public class JpaUserRepo implements UserRepo, Closeable {')).toBe(true);
    expect(impl('public interface AdminRepo extends UserRepo {')).toBe(true);
    expect(impl('export class MemoryUserRepo implements UserRepo {')).toBe(true);
    expect(impl('final class EloquentUserRepo extends Base implements UserRepo')).toBe(true);
    expect(impl('class KtUserRepo(private val db: Db) : UserRepo {')).toBe(true);
    expect(impl('public sealed class SqlUserRepo : IDisposable, UserRepo')).toBe(true);
  });

  it('leaves its uses and the names that only contain it', () => {
    expect(impl('  private final UserRepo repo;')).toBe(false);
    expect(impl('constructor(private repo: UserRepo) {}')).toBe(false);
    expect(impl('public class X implements UserRepository {')).toBe(false);
  });
});
